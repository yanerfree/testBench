"""MCP 工具 — 环境和变量"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import environment_service


async def list_environments(session: AsyncSession) -> list[dict]:
    """列出所有测试环境。"""
    envs = await environment_service.list_environments(session)
    return [{"id": str(e.id), "name": e.name, "description": e.description} for e in envs]


async def get_merged_variables(session: AsyncSession, env_id: str) -> dict:
    """获取合并后的变量（全局变量 + 环境变量，环境优先）。"""
    return await environment_service.get_merged_variables(session, uuid.UUID(env_id))
