"""AI 优化服务 — 用户提建议 → AI 分析方案 → 确认后执行"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_test import ApiTestScenario, ApiTestStep
from app.services.ai import llm_client
from app.services.ai_config_resolver import ResolvedAIConfig

logger = logging.getLogger(__name__)


async def analyze_optimization(
    scenario_id: uuid.UUID,
    suggestion: str,
    ai_config: ResolvedAIConfig,
    session: AsyncSession,
) -> dict:
    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario:
        return {"error": "场景不存在"}

    steps_result = await session.execute(
        select(ApiTestStep).where(ApiTestStep.scenario_id == scenario_id).order_by(ApiTestStep.sort_order)
    )
    steps = steps_result.scalars().all()

    current_steps = []
    for s in steps:
        current_steps.append({
            "id": str(s.id),
            "name": s.name,
            "method": s.method,
            "url": s.url,
            "body": s.body,
            "assertions": s.assertions,
        })

    messages = [
        {"role": "system", "content": """你是资深 QA 工程师。用户对已有测试场景提出了优化建议，请分析并给出具体修改方案。

输出 JSON 格式：
{"plan": {"summary": "方案摘要", "changes": [{"action": "add|modify|delete", "stepIndex": 数字(modify/delete时必填), "step": {完整的步骤对象(add/modify时必填)}, "reason": "修改原因"}]}}

step 对象格式：{"name": "步骤名", "method": "POST", "url": "...", "headers": {"Authorization": "Bearer ${AUTH_TOKEN}", "Content-Type": "application/json"}, "body": {...}, "assertions": [...], "variables_extract": {...}}

直接输出 JSON，不要用 ```json 包裹。"""},
        {"role": "user", "content": f"""场景：{scenario.title}

当前步骤：
{json.dumps(current_steps, ensure_ascii=False, indent=2)}

用户建议：{suggestion}"""},
    ]

    content = await llm_client.call(messages, config=ai_config, max_tokens=4096)

    import re
    brace = content.find("{")
    if brace < 0:
        return {"error": "AI 返回格式错误"}
    try:
        data = json.loads(content[brace:])
        return data.get("plan", data)
    except json.JSONDecodeError:
        return {"error": "AI 返回 JSON 解析失败", "raw": content[:500]}


async def apply_optimization(
    scenario_id: uuid.UUID,
    changes: list[dict],
    session: AsyncSession,
) -> dict:
    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario:
        return {"error": "场景不存在"}

    steps_result = await session.execute(
        select(ApiTestStep).where(ApiTestStep.scenario_id == scenario_id).order_by(ApiTestStep.sort_order)
    )
    steps = list(steps_result.scalars().all())

    applied = 0
    for change in changes:
        action = change.get("action")
        step_data = change.get("step", {})

        if action == "add":
            from sqlalchemy import func as sa_func
            max_order = await session.execute(
                select(sa_func.max(ApiTestStep.sort_order)).where(ApiTestStep.scenario_id == scenario_id)
            )
            next_order = (max_order.scalar() or 0) + 1

            insert_index = change.get("stepIndex")
            if insert_index is not None and 0 <= insert_index <= len(steps):
                next_order = insert_index

            session.add(ApiTestStep(
                scenario_id=scenario_id,
                sort_order=next_order,
                name=step_data.get("name", "新步骤"),
                method=step_data.get("method", "GET"),
                url=step_data.get("url", ""),
                headers=step_data.get("headers"),
                body=step_data.get("body"),
                assertions=step_data.get("assertions", []),
                variables_extract=step_data.get("variables_extract"),
            ))
            applied += 1

        elif action == "modify":
            idx = change.get("stepIndex")
            if idx is not None and 0 <= idx < len(steps):
                step = steps[idx]
                for field in ["name", "method", "url", "headers", "body", "assertions", "variables_extract"]:
                    if field in step_data:
                        setattr(step, field, step_data[field])
                applied += 1

        elif action == "delete":
            idx = change.get("stepIndex")
            if idx is not None and 0 <= idx < len(steps):
                await session.delete(steps[idx])
                applied += 1

    if scenario.source == "ai" and not scenario.edited_after_generate:
        scenario.edited_after_generate = True

    await session.commit()
    return {"applied": applied, "total": len(changes)}
