"""病历 + 用量 API"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import get_current_user
from app.deps.db import get_db
from app.models.user import User
from app.models.case_file import CaseFileEvent, AIUsageLog

router = APIRouter(tags=["case-file"])


# ── 用例病历 ──

@router.get("/api/cases/{case_id}/file")
async def get_case_file(
    case_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(CaseFileEvent)
        .where(CaseFileEvent.case_id == case_id)
        .order_by(CaseFileEvent.created_at.desc())
    )
    events = result.scalars().all()

    # 自动标签
    tags = []
    fail_streak = 0
    total_exec = 0
    total_pass = 0
    for e in reversed(list(events)):
        if e.event_type == "executed_fail":
            fail_streak += 1
            total_exec += 1
        elif e.event_type == "executed_pass":
            fail_streak = 0
            total_exec += 1
            total_pass += 1

    if fail_streak >= 3:
        tags.append("#不稳定")
    if total_exec > 0 and total_pass / total_exec < 0.5:
        tags.append("#需要关注")
    if total_exec == 0:
        tags.append("#待验证")

    return {
        "data": {
            "events": [
                {
                    "id": str(e.id),
                    "eventType": e.event_type,
                    "summary": e.summary,
                    "detail": e.detail,
                    "createdAt": e.created_at.isoformat() if e.created_at else None,
                }
                for e in events
            ],
            "tags": tags,
            "stats": {
                "totalEvents": len(events),
                "totalExecutions": total_exec,
                "passCount": total_pass,
                "passRate": round(total_pass / total_exec * 100, 1) if total_exec > 0 else None,
            },
        }
    }


# ── AI 用量统计 ──

@router.get("/api/projects/{project_id}/ai-usage")
async def get_ai_usage(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 按 Skill 分组统计
    result = await session.execute(
        select(
            AIUsageLog.skill_name,
            sa_func.count().label("count"),
            sa_func.sum(AIUsageLog.total_tokens).label("tokens"),
            sa_func.sum(AIUsageLog.duration_ms).label("duration"),
        )
        .where(AIUsageLog.project_id == project_id)
        .group_by(AIUsageLog.skill_name)
    )
    rows = result.all()

    total_tokens = sum(r.tokens or 0 for r in rows)
    total_calls = sum(r.count for r in rows)

    return {
        "data": {
            "totalTokens": total_tokens,
            "totalCalls": total_calls,
            "bySkill": [
                {
                    "skillName": r.skill_name,
                    "calls": r.count,
                    "tokens": r.tokens or 0,
                    "durationMs": r.duration or 0,
                }
                for r in rows
            ],
        }
    }
