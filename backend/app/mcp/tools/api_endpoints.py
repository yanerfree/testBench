"""MCP 工具 — API 接口"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import api_collection_service


async def list_api_tree(session: AsyncSession, project_id: str) -> list[dict]:
    """获取项目下所有 API 接口的树形结构（文件夹和端点）。"""
    return await api_collection_service.list_tree(session, uuid.UUID(project_id))


async def get_api_node(session: AsyncSession, node_id: str) -> dict | None:
    """获取单个 API 节点详情（含 method, url, headers, body, auth 等）。"""
    return await api_collection_service.get_node(session, uuid.UUID(node_id))
