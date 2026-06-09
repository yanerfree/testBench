"""API 接口管理 — CRUD + Postman 导入"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.api_collection import (
    CreateNodeRequest, UpdateNodeRequest, ImportPostmanRequest,
)
from app.services import api_collection_service as svc

router = APIRouter(
    prefix="/api/projects/{project_id}/api-nodes",
    tags=["api-collection"],
)


@router.get("")
async def list_nodes(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    nodes = await svc.list_tree(session, project_id)
    return {"data": nodes}


@router.get("/{node_id}")
async def get_node(
    project_id: uuid.UUID,
    node_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    node = await svc.get_node(session, node_id)
    if not node:
        return {"data": None}
    return {"data": node}


@router.post("")
async def create_node(
    project_id: uuid.UUID,
    body: CreateNodeRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    node = await svc.create_node(session, project_id, user.id, body.model_dump(by_alias=False))
    return {"data": node}


@router.put("/{node_id}")
async def update_node(
    project_id: uuid.UUID,
    node_id: uuid.UUID,
    body: UpdateNodeRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    data = {k: v for k, v in body.model_dump(by_alias=False).items() if v is not None}
    node = await svc.update_node(session, node_id, data)
    return {"data": node}


@router.delete("/{node_id}")
async def delete_node(
    project_id: uuid.UUID,
    node_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    await svc.delete_node(session, node_id)
    return {"message": "删除成功"}


@router.post("/{node_id}/duplicate")
async def duplicate_node(
    project_id: uuid.UUID,
    node_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    node = await svc.duplicate_node(session, node_id, user.id)
    return {"data": node}


@router.post("/import/postman")
async def import_postman(
    project_id: uuid.UUID,
    body: ImportPostmanRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    count = await svc.import_postman(session, project_id, user.id, body.collection)
    return {"data": {"imported": count}, "message": f"成功导入 {count} 个接口"}


@router.post("/batch-sort")
async def batch_sort(
    project_id: uuid.UUID,
    body: list[dict],
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    await svc.batch_sort(session, body)
    return {"message": "排序已更新"}
