"""项目和分支查询工具 — Claude Code 用来定位目标项目和分支"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, Branch


async def list_projects(session: AsyncSession) -> list[dict]:
    """列出所有项目（名称、ID）。Claude Code 用于确定要操作的目标项目。"""
    result = await session.execute(select(Project).order_by(Project.created_at.desc()))
    return [{"id": str(p.id), "name": p.name, "description": p.description} for p in result.scalars().all()]


async def list_branches(session: AsyncSession, project_id: str) -> list[dict]:
    """列出项目下所有分支。Claude Code 用于确定目标分支。"""
    result = await session.execute(
        select(Branch)
        .where(Branch.project_id == uuid.UUID(project_id), Branch.status == "active")
        .order_by(Branch.created_at)
    )
    return [{"id": str(b.id), "name": b.name, "branch": b.branch, "description": b.description} for b in result.scalars().all()]
