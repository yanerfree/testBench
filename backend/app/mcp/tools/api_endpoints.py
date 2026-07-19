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


async def create_api_node(
    session: AsyncSession,
    project_id: str,
    name: str,
    node_type: str = "endpoint",
    method: str | None = "GET",
    url: str | None = "",
    parent_id: str | None = None,
    params: list[dict] | None = None,
    headers: list[dict] | None = None,
    body: str | None = "",
    body_type: str | None = "json",
    auth: dict | None = None,
    description: str | None = "",
    sort_order: int = 0,
) -> dict:
    """创建一个 API 接口节点（endpoint 或 folder）。"""
    data = {
        "node_type": node_type,
        "name": name,
        "method": method if node_type == "endpoint" else None,
        "url": url if node_type == "endpoint" else None,
        "parent_id": uuid.UUID(parent_id) if parent_id else None,
        "params": params,
        "headers": headers,
        "body": body if node_type == "endpoint" else None,
        "body_type": body_type if node_type == "endpoint" else None,
        "auth": auth,
        "description": description,
        "sort_order": sort_order,
    }
    return await api_collection_service.create_node(
        session, uuid.UUID(project_id), None, data,
    )
