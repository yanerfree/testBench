"""用例去重比对（ft S4.4 / FR18 / ADR-9）

pg_trgm 标题相似度 ≥ 阈值召回 → 步骤动作重叠复核 → 命中则 skip。
"""
from __future__ import annotations

import uuid

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.services.scenario_gen.settings import get_settings


async def find_duplicates(
    session: AsyncSession,
    branch_id: uuid.UUID,
    title: str,
    steps: list[dict] | None = None,
    exclude_case_id: uuid.UUID | None = None,
) -> list[dict]:
    """检查是否与同分支已有用例重复。

    返回匹配到的重复用例列表 [{id, caseCode, title, similarity}]。
    """
    cfg = get_settings()
    if not title or not title.strip():
        return []

    # pg_trgm 标题相似度查询
    query = text("""
        SELECT id, case_code, title,
               similarity(title, :title) AS sim
        FROM cases
        WHERE branch_id = :branch_id
          AND deleted_at IS NULL
          AND similarity(title, :title) >= :threshold
        ORDER BY sim DESC
        LIMIT 10
    """)
    result = await session.execute(query, {
        "branch_id": str(branch_id),
        "title": title,
        "threshold": cfg.dedup_title_threshold,
    })
    candidates = [
        {"id": str(row.id), "caseCode": row.case_code, "title": row.title, "similarity": round(float(row.sim), 2)}
        for row in result.all()
        if str(row.id) != str(exclude_case_id)
    ]

    if not candidates or not steps:
        return candidates

    # 步骤动作重叠复核
    step_actions = {s.get("action", "") for s in steps if isinstance(s, dict) and s.get("action")}
    if not step_actions:
        return candidates

    confirmed = []
    for cand in candidates:
        existing = await session.get(Case, uuid.UUID(cand["id"]))
        if not existing or not existing.steps:
            continue
        existing_actions = {s.get("action", "") for s in existing.steps if isinstance(s, dict) and s.get("action")}
        if not existing_actions:
            continue
        overlap = len(step_actions & existing_actions) / max(len(step_actions), 1)
        if overlap >= cfg.dedup_step_overlap:
            cand["stepOverlap"] = round(overlap, 2)
            confirmed.append(cand)

    return confirmed
