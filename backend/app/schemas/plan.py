import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import BaseSchema


class CreatePlanRequest(BaseSchema):
    """创建测试计划请求"""
    name: str = Field(min_length=1, max_length=200)
    plan_type: Literal["automated", "manual"]
    test_type: Literal["api", "e2e"]
    case_ids: list[uuid.UUID] = Field(min_length=1)
    environment_id: uuid.UUID | None = None
    channel_id: uuid.UUID | None = None
    retry_count: int = Field(default=0, ge=0, le=3)
    circuit_breaker: dict | None = None


class UpdatePlanRequest(BaseSchema):
    """更新测试计划请求（仅 draft 状态可用）"""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    case_ids: list[uuid.UUID] | None = None
    environment_id: uuid.UUID | None = None
    channel_id: uuid.UUID | None = None
    retry_count: int | None = Field(default=None, ge=0, le=3)
    circuit_breaker: dict | None = None


class PlanResponse(BaseSchema):
    """计划详情响应"""
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
    case_ids: list[uuid.UUID] = []


class PlanListItem(BaseSchema):
    """计划列表项"""
    id: uuid.UUID
    name: str
    plan_type: str
    test_type: str
    status: str
    case_count: int
    created_at: datetime
