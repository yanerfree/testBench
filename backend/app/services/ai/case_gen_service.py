"""用例生成服务 — 组装 prompt + 解析生成结果 + 导入到 DB"""
from __future__ import annotations

import json
import logging
import uuid

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, CaseFolder
from app.services.ai.prompts.case_generation import get_system_prompt, get_user_prompt

logger = logging.getLogger(__name__)


def build_case_gen_messages(
    interface_info: str,
    business_rules: list[str],
    module: str,
    submodule: str | None = None,
) -> list[dict]:
    return [
        {"role": "system", "content": get_system_prompt()},
        {"role": "user", "content": get_user_prompt(interface_info, business_rules, module, submodule)},
    ]


async def import_generated_cases(
    cases: list[dict],
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    folder_id: uuid.UUID | None,
    user_id: uuid.UUID,
    session: AsyncSession,
) -> dict:
    if not folder_id and cases:
        module_name = cases[0].get("module", "AI 生成")
        folder_id = await _ensure_folder(session, branch_id, module_name)

    max_seq = await _max_case_seq(session, branch_id)
    imported = 0
    skipped = 0

    for i, c in enumerate(cases):
        title = c.get("title", "").strip()
        if not title:
            skipped += 1
            continue

        max_seq += 1
        module = c.get("module", "ai")
        prefix = module.replace(" ", "-").replace("/", "-")[:16]
        case_code = f"TC-{prefix}-{max_seq:05d}"
        tea_id = f"ai-{uuid.uuid4().hex[:8]}"

        tags = c.get("tags", [])

        case = Case(
            branch_id=branch_id,
            case_code=case_code,
            tea_id=tea_id,
            title=title,
            type=c.get("type", "api"),
            folder_id=folder_id,
            priority=c.get("priority", "P2"),
            preconditions=c.get("preconditions"),
            steps=c.get("steps", []),
            expected_result=c.get("expected_result"),
            tags=tags,
            source="ai",
            remark="AI 生成",
        )
        session.add(case)
        imported += 1

    await session.flush()
    return {"imported": imported, "skipped": skipped, "total": len(cases)}


async def _ensure_folder(session: AsyncSession, branch_id: uuid.UUID, name: str) -> uuid.UUID:
    stmt = select(CaseFolder).where(
        CaseFolder.branch_id == branch_id,
        CaseFolder.name == name,
        CaseFolder.depth == 1,
    )
    result = await session.execute(stmt)
    folder = result.scalar_one_or_none()
    if folder:
        return folder.id

    folder = CaseFolder(
        branch_id=branch_id,
        name=name,
        path=f"/{name}",
        depth=1,
    )
    session.add(folder)
    await session.flush()
    return folder.id


async def _max_case_seq(session: AsyncSession, branch_id: uuid.UUID) -> int:
    stmt = select(sa_func.count()).select_from(Case).where(Case.branch_id == branch_id)
    result = await session.execute(stmt)
    return result.scalar() or 0
