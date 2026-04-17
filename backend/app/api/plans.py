"""测试计划 API"""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import get_current_user, require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.common import BaseSchema, MessageResponse
from app.schemas.plan import CreatePlanRequest, PlanListItem, PlanResponse
from app.services import execution_service, plan_service, report_service

router = APIRouter(prefix="/api/projects/{project_id}/plans", tags=["plans"])


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


# ---- 执行相关 Schema ----

class ManualRecordRequest(BaseSchema):
    scenario_id: uuid.UUID
    status: Literal["passed", "failed"]
    remark: str | None = None
    duration_ms: int | None = None

class ScenarioResponse(BaseSchema):
    id: uuid.UUID
    case_id: uuid.UUID | None
    case_code: str | None
    scenario_name: str
    status: str
    execution_type: str
    duration_ms: int | None
    remark: str | None
    sort_order: int

class ReportResponse(BaseSchema):
    id: uuid.UUID
    plan_id: uuid.UUID
    executed_at: datetime
    completed_at: datetime | None
    total_scenarios: int
    passed: int
    failed: int
    error: int
    skipped: int
    pass_rate: float | None
    manual_count: int


# ---- 执行 API ----

@router.post("/{plan_id}/execute")
async def execute_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """启动计划执行（创建报告 + scenarios，状态改为 executing）"""
    report = await execution_service.start_execution(session, plan_id, current_user.id)
    return {"data": ReportResponse.model_validate(report, from_attributes=True).model_dump(by_alias=True)}


@router.post("/{plan_id}/manual-record")
async def manual_record(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: ManualRecordRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """录入单条手动测试结果"""
    # 先获取报告 ID
    data = await execution_service.get_report_with_scenarios(session, plan_id)
    if data is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError(code="NO_REPORT", message="计划尚未执行")
    scenario = await execution_service.record_manual_result(
        session, data["report"].id, body.scenario_id, body.status, body.remark, body.duration_ms
    )
    return {"data": ScenarioResponse.model_validate(scenario, from_attributes=True).model_dump(by_alias=True)}


@router.post("/{plan_id}/complete")
async def complete_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """确认完成执行"""
    plan = await execution_service.complete_execution(session, plan_id)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.get("/{plan_id}/results")
async def get_results(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """获取计划执行结果（报告 + 场景列表）"""
    data = await execution_service.get_report_with_scenarios(session, plan_id)
    if data is None:
        return {"data": None}
    return {
        "data": {
            "report": ReportResponse.model_validate(data["report"], from_attributes=True).model_dump(by_alias=True),
            "scenarios": [
                ScenarioResponse.model_validate(s, from_attributes=True).model_dump(by_alias=True)
                for s in data["scenarios"]
            ],
        }
    }


@router.get("/{plan_id}/report")
async def get_report_dashboard(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """报告仪表盘（L1 汇总 + L2 模块分组）"""
    data = await report_service.get_report_dashboard(session, plan_id)
    if data is None:
        return {"data": None}
    return {"data": data}
