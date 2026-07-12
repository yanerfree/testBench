"""工具箱 API — 为前端工具箱提供 AI 辅助能力、HTTP 代理和认证工具"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/toolbox", tags=["toolbox"])


class RegexGenRequest(BaseModel):
    description: str = Field(..., max_length=500)


@router.post("/generate-regex")
async def generate_regex(body: RegexGenRequest):
    try:
        from app.services.ai.llm_client import complete
        resp = await complete(
            messages=[
                {"role": "system", "content": (
                    "你是一个正则表达式专家。用户会用自然语言描述需求，你需要返回对应的 JavaScript 正则表达式。\n"
                    "要求：\n"
                    "1. 只返回正则表达式本身，不要加 / 包裹\n"
                    "2. 同时给出简短说明\n"
                    "3. 严格按以下 JSON 格式返回，不要有其他内容：\n"
                    '{"regex": "正则表达式", "flags": "标志位", "explanation": "简短说明"}'
                )},
                {"role": "user", "content": body.description},
            ],
            max_tokens=200,
        )
        import json
        try:
            text = resp.content.strip()
            if text.startswith("```"): text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(text)
            return {"data": data}
        except (json.JSONDecodeError, IndexError):
            return {"data": {"regex": resp.content.strip(), "flags": "g", "explanation": ""}}
    except Exception as e:
        logger.warning("正则生成失败: %s", e)
        return {"error": str(e)[:200]}


class HttpRequestBody(BaseModel):
    method: str = Field(default="GET")
    url: str
    headers: dict | None = None
    body: str | None = None
    timeout: int = Field(default=30, ge=1, le=120)


@router.post("/http-request")
async def send_http_request(req: HttpRequestBody):
    try:
        headers = dict(req.headers) if req.headers else {}
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=req.timeout, follow_redirects=True, verify=False) as client:
            resp = await client.request(
                method=req.method.upper(),
                url=req.url,
                headers=headers,
                content=req.body.encode("utf-8") if req.body else None,
            )
        elapsed = round((time.perf_counter() - t0) * 1000, 1)
        resp_headers = dict(resp.headers)
        ct = resp_headers.get("content-type", "")
        try:
            resp_body = resp.text
        except Exception:
            resp_body = f"[Binary {len(resp.content)} bytes]"
        return {
            "data": {
                "statusCode": resp.status_code,
                "headers": resp_headers,
                "body": resp_body[:100000],
                "elapsed": elapsed,
                "size": len(resp.content),
            }
        }
    except httpx.ConnectError as e:
        return {"error": f"连接失败: {e}"}
    except httpx.TimeoutException:
        return {"error": f"请求超时 ({req.timeout}s)"}
    except Exception as e:
        return {"error": str(e)[:300]}


# ── 认证工具 ──

class JwtSignRequest(BaseModel):
    payload: dict
    secret: str
    algorithm: str = "HS256"

@router.post("/jwt-sign")
async def jwt_sign(body: JwtSignRequest):
    try:
        header = {"alg": body.algorithm, "typ": "JWT"}
        def b64url(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
        h = b64url(json.dumps(header, separators=(",", ":")).encode())
        p = b64url(json.dumps(body.payload, separators=(",", ":"), ensure_ascii=False).encode())
        signing_input = f"{h}.{p}".encode()
        if body.algorithm == "HS256":
            sig = hmac.new(body.secret.encode(), signing_input, hashlib.sha256).digest()
        elif body.algorithm == "HS384":
            sig = hmac.new(body.secret.encode(), signing_input, hashlib.sha384).digest()
        elif body.algorithm == "HS512":
            sig = hmac.new(body.secret.encode(), signing_input, hashlib.sha512).digest()
        else:
            return {"error": f"不支持的算法: {body.algorithm}"}
        token = f"{h}.{p}.{b64url(sig)}"
        return {"data": {"token": token}}
    except Exception as e:
        return {"error": str(e)[:200]}


class HmacSignRequest(BaseModel):
    message: str
    secret: str
    algorithm: str = "SHA-256"

@router.post("/hmac-sign")
async def hmac_sign(body: HmacSignRequest):
    try:
        algo_map = {"SHA-1": hashlib.sha1, "SHA-256": hashlib.sha256, "SHA-384": hashlib.sha384, "SHA-512": hashlib.sha512}
        hash_fn = algo_map.get(body.algorithm)
        if not hash_fn:
            return {"error": f"不支持的算法: {body.algorithm}"}
        sig = hmac.new(body.secret.encode(), body.message.encode(), hash_fn).digest()
        return {"data": {
            "hex": sig.hex(),
            "base64": base64.b64encode(sig).decode(),
        }}
    except Exception as e:
        return {"error": str(e)[:200]}
