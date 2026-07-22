"""自动化生成上下文 —— 汇聚场景变量(Epic2)/全局资源(Epic1)/鉴权token(S1.3)/API提示，
注入到 UI 脚本生成 prompt，让生成的脚本鉴权造数(不再 401)、引用而非删除全局数据、数据唯一可复跑。
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_resource import AutomationResource
from app.models.scenario_variable import ScenarioVariable
from app.services import token_service


@dataclass
class AutomationContext:
    scenario_vars: list[dict] = field(default_factory=list)
    resources: list[dict] = field(default_factory=list)
    api_hints: list[dict] = field(default_factory=list)
    has_token: bool = False
    token: str | None = None
    role: str = "ADMIN"


async def build_context(
    session: AsyncSession,
    case_id,
    project_id,
    env_id,
    role: str = "ADMIN",
    token_refresh: bool = False,
) -> AutomationContext:
    ctx = AutomationContext(role=(role or "ADMIN").upper())

    # 1) 场景变量（Epic2）——生成脚本用 process.env.SV_<name>，random 已唯一
    sv_rows = await session.execute(
        select(ScenarioVariable).where(ScenarioVariable.case_id == uuid.UUID(str(case_id)))
    )
    for v in sv_rows.scalars().all():
        ctx.scenario_vars.append({
            "name": v.name, "kind": v.kind,
            "env": f"SV_{v.name}",
            "template": v.value_template,
            "description": v.description,
        })

    # 2) 项目全局资源（Epic1）——引用而非创建/删除
    if project_id:
        ar_rows = await session.execute(
            select(AutomationResource).where(AutomationResource.project_id == uuid.UUID(str(project_id)))
        )
        for r in ar_rows.scalars().all():
            ctx.resources.append({"name": r.name, "keep": r.keep, "description": r.description})

    # 3) 鉴权 token（S1.3）——作为 process.env.TEST_TOKEN 注入
    if env_id:
        token = await token_service.get_target_token(session, env_id, ctx.role, force_refresh=token_refresh)
        ctx.token = token
        ctx.has_token = bool(token)

    # 4) API 提示（可选）——真实 create/delete 端点，供鉴权造数参考（探索时以实测为准）
    if project_id:
        ctx.api_hints = await _load_api_hints(session, project_id)

    return ctx


async def _load_api_hints(session: AsyncSession, project_id) -> list[dict]:
    """取项目里 POST/PUT/DELETE 类端点（造数/清理最可能用到），method+path 精简列表。"""
    try:
        from app.models.api_collection import ApiNode
    except Exception:
        return []
    try:
        rows = await session.execute(
            select(ApiNode).where(
                ApiNode.project_id == uuid.UUID(str(project_id)),
                ApiNode.node_type == "endpoint",
            )
        )
        hints = []
        for n in rows.scalars().all():
            m = (n.method or "").upper()
            if m in ("POST", "PUT", "DELETE", "PATCH"):
                url = (n.url or "").replace("{{BASE_URL}}", "").replace("{{baseUrl}}", "")
                hints.append({"method": m, "url": url, "name": n.name})
        # 去重 + 限量，避免 prompt 过长
        seen, out = set(), []
        for h in hints:
            k = (h["method"], h["url"])
            if k in seen:
                continue
            seen.add(k)
            out.append(h)
            if len(out) >= 25:
                break
        return out
    except Exception:
        return []


def render_prompt_block(ctx: AutomationContext) -> str:
    """渲染注入 prompt 的「自动化上下文」块。空则返回空串。"""
    if not (ctx.scenario_vars or ctx.resources or ctx.has_token or ctx.api_hints):
        return ""
    lines = ["\n## 自动化上下文（本项目/环境已备好，务必优先使用）"]

    if ctx.has_token:
        lines.append(
            "- **鉴权 token 已就绪**：执行环境会注入 `process.env.TEST_TOKEN`（当前角色 "
            f"{ctx.role} 的有效 Bearer token）。**所有 API 造数/清理直接用它鉴权**：\n"
            "  `page.request.post(url, { headers: { Authorization: `Bearer ${process.env.TEST_TOKEN}` }, data: {...} })`。\n"
            "  **不要再去 localStorage 里翻 token**（那样脆弱易错）；直接用 TEST_TOKEN。"
        )
    if ctx.scenario_vars:
        sv = "; ".join(
            f"{v['env']}({v['kind']}{'，唯一随机' if v['kind']=='random' else ''})"
            for v in ctx.scenario_vars
        )
        lines.append(
            f"- **场景变量**（执行环境注入，UI/接口共用）：{sv}。\n"
            "  用例要用到的数据值请用 `process.env.SV_<名>`；random 类每次执行自动加唯一后缀，"
            "可据此识别本脚本造的数据。**不要在脚本里再自己拼随机名**——用 SV 变量即可。"
        )
    if ctx.resources:
        rs = "; ".join(f"{r['name']}" + (f"（{r['description']}）" if r.get("description") else "") for r in ctx.resources)
        lines.append(
            f"- **全局共享资源**（跑前已预检存在，长期保留）：{rs}。\n"
            "  这些是全局数据：**只引用、不创建、绝不删除**。用例需要它们时按名引用即可。"
        )
    if ctx.api_hints:
        ah = "\n".join(f"    {h['method']} {h['url']}" + (f"  # {h['name']}" if h.get("name") else "") for h in ctx.api_hints[:25])
        lines.append(
            "- **可用 API（造数/清理参考，探索时以实测为准）**：\n" + ah
        )
    lines.append(
        "- **造数规则重申**：场景级数据（本用例专属）→ 用 TEST_TOKEN 鉴权、经 API 自建 + 唯一命名(SV 变量) + "
        "cleanup 里自删；全局资源 → 只引用不删。保证脚本自包含、可反复执行。"
    )
    return "\n".join(lines)
