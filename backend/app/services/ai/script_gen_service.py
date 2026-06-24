"""脚本生成服务 — 从用例构建 prompt"""
from __future__ import annotations

import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.services.ai.prompts.script_generation import get_system_prompt, get_user_prompt


async def build_script_gen_messages(
    case_ids: list[str],
    script_type: str,
    session: AsyncSession,
) -> list[dict]:
    uuids = [uuid.UUID(cid) for cid in case_ids]
    stmt = select(Case).where(Case.id.in_(uuids))
    result = await session.execute(stmt)
    cases = result.scalars().all()

    if not cases:
        raise ValueError("未找到指定的测试用例")

    cases_text = _format_cases(cases, script_type)
    return [
        {"role": "system", "content": get_system_prompt()},
        {"role": "user", "content": get_user_prompt(cases_text, script_type)},
    ]


def _format_cases(cases: list[Case], script_type: str) -> str:
    parts = []
    for c in cases:
        lines = [
            f"## 用例: {c.title}",
            f"- 编号: {c.case_code}",
            f"- 优先级: {c.priority}",
            f"- 类型: {c.type}",
        ]
        if c.preconditions:
            lines.append(f"- 前置条件: {c.preconditions}")
        if c.steps:
            lines.append("- 步骤:")
            for i, step in enumerate(c.steps, 1):
                action = step.get("action", step.get("description", ""))
                expected = step.get("expected", step.get("expectedResult", ""))
                lines.append(f"  {i}. {action}")
                if expected:
                    lines.append(f"     预期: {expected}")
        if c.expected_result:
            lines.append(f"- 总体预期: {c.expected_result}")
        if c.api_scenario and script_type == "api":
            lines.append(f"- API 场景: {json.dumps(c.api_scenario, ensure_ascii=False)}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)
