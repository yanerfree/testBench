"""目标系统 token 登录回填服务 —— 登录一次、Redis 缓存(TTL)、401 失效刷新。

供 UI/接口自动化在生成/执行时注入 Bearer token（TEST_TOKEN / ${TOKEN}），
避免每条用例重复登录。凭证沿用环境变量（多角色 {ROLE}_USERNAME/{ROLE}_PASSWORD），
登录配方可用环境变量覆盖，未配置时按同构网关默认 + 自动探测 token 字段。

环境变量约定（除凭证外均可选，有默认）：
  BASE_URL              目标系统基址（必需，用于拼默认登录地址）
  {ROLE}_USERNAME/_PASSWORD  角色凭证（ROLE 如 ADMIN/TENANT，默认 ADMIN）
  LOGIN_URL             登录地址（默认 {BASE_URL}/api/auth/login，可为相对路径）
  LOGIN_METHOD          默认 POST
  LOGIN_USER_FIELD      用户名字段名，默认 username
  LOGIN_PASS_FIELD      密码字段名，默认 password
  LOGIN_TOKEN_PATH      token 在响应中的点路径（如 data.accessToken）；不填则自动探测
  LOGIN_TOKEN_TTL       缓存秒数，默认 1800
"""
from __future__ import annotations

import uuid
from typing import Any

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.environment import EnvironmentVariable

_DEFAULT_TTL = 1800  # 30 分钟


def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def _cache_key(env_id: str, role: str) -> str:
    return f"tbtoken:{env_id}:{role.upper()}"


async def _load_env_vars(session: AsyncSession, env_id) -> dict[str, str]:
    rows = await session.execute(
        select(EnvironmentVariable).where(
            EnvironmentVariable.environment_id == uuid.UUID(str(env_id))
        )
    )
    return {v.key: v.value for v in rows.scalars().all()}


def _dig(obj: Any, path: str | None) -> str | None:
    """按点路径取字符串值。"""
    if not path:
        return None
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur if isinstance(cur, str) and cur else None


def _auto_token(obj: Any) -> str | None:
    """自动探测 token：先试常见路径，再递归找 key 含 token 的非空字符串值。"""
    for p in (
        "data.accessToken", "data.token", "data.access_token", "data.jwt",
        "accessToken", "token", "access_token", "jwt",
        "data.data.accessToken", "result.token", "result.accessToken",
    ):
        v = _dig(obj, p)
        if v:
            return v

    def walk(o: Any) -> str | None:
        if isinstance(o, dict):
            for k, val in o.items():
                if isinstance(val, str) and val and "token" in k.lower():
                    return val
            for val in o.values():
                r = walk(val)
                if r:
                    return r
        elif isinstance(o, list):
            for it in o:
                r = walk(it)
                if r:
                    return r
        return None

    return walk(obj)


async def fetch_token(env_vars: dict[str, str], role: str = "ADMIN") -> tuple[str | None, str | None]:
    """按环境变量登录目标系统，返回 (token, error)。不读/写缓存，供 API 探活与刷新复用。"""
    base = (env_vars.get("BASE_URL") or "").rstrip("/")
    role = (role or "ADMIN").upper()
    user = (
        env_vars.get(f"{role}_USERNAME") or env_vars.get(f"{role}_USER")
        or env_vars.get("TEST_USER") or env_vars.get("USERNAME")
    )
    pwd = (
        env_vars.get(f"{role}_PASSWORD") or env_vars.get(f"{role}_PWD")
        or env_vars.get("TEST_PASSWORD") or env_vars.get("PASSWORD")
    )
    if not user or not pwd:
        return None, f"环境缺少 {role}_USERNAME/{role}_PASSWORD"

    login_url = env_vars.get("LOGIN_URL") or (f"{base}/api/auth/login" if base else None)
    if login_url and not login_url.lower().startswith("http"):
        if not base:
            return None, "LOGIN_URL 为相对路径但缺少 BASE_URL"
        login_url = f"{base}/{login_url.lstrip('/')}"
    if not login_url:
        return None, "缺少 LOGIN_URL 或 BASE_URL"

    method = (env_vars.get("LOGIN_METHOD") or "POST").upper()
    uf = env_vars.get("LOGIN_USER_FIELD") or "username"
    pf = env_vars.get("LOGIN_PASS_FIELD") or "password"
    body = {uf: user, pf: pwd}

    try:
        async with httpx.AsyncClient(timeout=15, verify=False) as client:
            resp = await client.request(method, login_url, json=body)
    except Exception as e:  # noqa: BLE001
        return None, f"登录请求失败: {e}"

    if resp.status_code >= 400:
        return None, f"登录失败 HTTP {resp.status_code}: {resp.text[:120]}"
    try:
        data = resp.json()
    except Exception:  # noqa: BLE001
        return None, "登录响应非 JSON"

    path = env_vars.get("LOGIN_TOKEN_PATH")
    token = _dig(data, path) if path else _auto_token(data)
    if not token:
        return None, "未能从登录响应提取 token（可设 LOGIN_TOKEN_PATH）"
    return token, None


async def get_target_token(
    session: AsyncSession, env_id, role: str = "ADMIN", *, force_refresh: bool = False
) -> str | None:
    """取目标系统 token：优先 Redis 缓存，未命中/强制刷新则登录一次并回填缓存。"""
    if not env_id:
        return None
    role = (role or "ADMIN").upper()
    key = _cache_key(str(env_id), role)
    r = _redis()
    try:
        if not force_refresh:
            cached = await r.get(key)
            if cached:
                return cached
        env_vars = await _load_env_vars(session, env_id)
        token, _err = await fetch_token(env_vars, role)
        if not token:
            return None
        try:
            ttl = int(env_vars.get("LOGIN_TOKEN_TTL") or _DEFAULT_TTL)
        except (TypeError, ValueError):
            ttl = _DEFAULT_TTL
        await r.set(key, token, ex=ttl)
        return token
    finally:
        await r.aclose()


async def invalidate_token(env_id, role: str = "ADMIN") -> None:
    """失效指定角色 token（供 401 后强制重登）。"""
    r = _redis()
    try:
        await r.delete(_cache_key(str(env_id), (role or "ADMIN").upper()))
    finally:
        await r.aclose()


async def auth_header(session: AsyncSession, env_id, role: str = "ADMIN") -> dict[str, str]:
    """便捷方法：返回 {"Authorization": "Bearer <token>"}，取不到则空 dict。"""
    token = await get_target_token(session, env_id, role)
    return {"Authorization": f"Bearer {token}"} if token else {}
