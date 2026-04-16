"""测试计划 API"""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import get_current_user, require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.common import BaseSchema, MessageResponse
from app.services import plan_service

router = APIRouter(prefix="/api/projects/{project_id}/plans", tags=["plans"])


# ---- Schema ----

class CreatePlanRequest(BaseSchema):
    name: str = Field(min_length=1, max_length=200)
    plan_type: Literal["automated", "manual"]
    test_type: Literal["api", "e2e"]
    case_ids: list[uuid.UUID] = Field(min_length=1)
    environment_id: uuid.UUID | None = None
    channel_id: uuid.UUID | None = None
    retry_count: int = Field(default=0, ge=0, le=3)
    circuit_breaker: dict | None = None


class PlanResponse(BaseSchema):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    plan_type: str
    test_type: str
    environment_id: uuid.UUID | None
    channel_id: uuid.UUID | None
    retry_count: int
    circuit_breaker: dict | None
    status: str
    created_by: uuid.UUID
    executed_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PlanListItem(BaseSchema):
    id: uuid.UUID
    name: str
    plan_type: str
    test_type: str
    status: str
    case_count: int
    created_at: datetime


# ---- API ----

@router.post("", status_code=HTTP_201_CREATED)
async def create_plan(
    project_id: uuid.UUID,
    body: CreatePlanRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """创建测试计划"""
    plan = await plan_service.create_plan(
        session, project_id, current_user.id,
        name=body.name, plan_type=body.plan_type, test_type=body.test_type,
        case_ids=body.case_ids, environment_id=body.environment_id,
        channel_id=body.channel_id, retry_count=body.retry_count,
        circuit_breaker=body.circuit_breaker,
    )
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.get("")
async def list_plans(
    project_id: uuid.UUID,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """计划列表"""
    items, total = await plan_service.list_plans(session, project_id, status, page, page_size)
    return {
        "data": [
            PlanListItem(
                id=it["plan"].id, name=it["plan"].name,
                plan_type=it["plan"].plan_type, test_type=it["plan"].test_type,
                status=it["plan"].status, case_count=it["case_count"],
                created_at=it["plan"].created_at,
            ).model_dump(by_alias=True)
            for it in items
        ],
        "pagination": {"page": page, "pageSize": page_size, "total": total},
    }


@router.get("/{plan_id}")
async def get_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """计划详情"""
    plan = await plan_service.get_plan(session, plan_id)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.post("/{plan_id}/archive")
async def archive_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """归档计划"""
    plan = await plan_service.archive_plan(session, plan_id)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.delete("/{plan_id}")
async def delete_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """删除计划（仅草稿或已归档）"""
    await plan_service.delete_plan(session, plan_id)
    return MessageResponse(message="删除成功").model_dump()
