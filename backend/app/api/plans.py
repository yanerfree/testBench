"""测试计划 API"""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import get_current_user, require_project_role
from app.deps.db import get_db
from app.deps.worker import get_arq_pool
from app.engine.task_status import set_task_status
from app.models.user import User
from app.schemas.common import BaseSchema, MessageResponse
from app.schemas.plan import CreatePlanRequest, PlanListItem, PlanResponse
from app.services import execution_service, export_service, plan_service, report_service

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


@router.post("/{plan_id}/reopen")
async def reopen_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """重新打开已完成的计划（已有结果保留，可继续补充录入）"""
    plan = await plan_service.get_plan(session, plan_id)

    # 权限：仅 project_admin 或计划创建者
    if current_user.role != "admin" and current_user.id != plan.created_by:
        from app.deps.auth import require_project_role as _rpr
        # 非创建者需要 project_admin 权限
        from sqlalchemy import select
        from app.models.project import ProjectMember
        result = await session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
                ProjectMember.role == "project_admin",
            )
        )
        if result.scalar_one_or_none() is None:
            from app.core.exceptions import ForbiddenError
            raise ForbiddenError(code="REOPEN_DENIED", message="仅项目管理员或计划创建者可重新打开")

    plan = await plan_service.reopen_plan(session, plan_id)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


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
    """启动计划执行。

    手动计划: 创建报告 + scenarios，直接返回。
    自动化计划: 创建报告后提交 arq 异步任务执行，返回 taskId 供轮询。
    """
    report = await execution_service.start_execution(session, plan_id, current_user.id)

    # 判断是否自动化计划
    plan = await plan_service.get_plan(session, plan_id)
    if plan.plan_type == "automated":
        # 提交异步执行任务
        pool = await get_arq_pool()
        task_id = uuid.uuid4().hex
        await set_task_status(task_id, "pending", message="自动化执行任务已提交...")
        await pool.enqueue_job(
            "run_automated_execution",
            task_id,
            str(plan_id),
            str(report.id),
            str(current_user.id),
        )
        return {
            "data": {
                **ReportResponse.model_validate(report, from_attributes=True).model_dump(by_alias=True),
                "taskId": task_id,
            }
        }

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


@router.get("/{plan_id}/export/excel")
async def export_excel(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """导出 Excel 报告"""
    from fastapi.responses import StreamingResponse
    output = await export_service.export_excel(session, plan_id)
    if output is None:
        from app.core.exceptions import NotFoundError
        raise NotFoundError(code="NO_REPORT", message="报告不存在")
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=report-{plan_id}.xlsx"},
    )


@router.get("/{plan_id}/scenarios/{scenario_id}/steps")
async def get_scenario_steps(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """获取场景的步骤列表（L3 下钻）"""
    from sqlalchemy import select
    from app.models.report import TestReportStep
    result = await session.execute(
        select(TestReportStep)
        .where(TestReportStep.scenario_id == scenario_id)
        .order_by(TestReportStep.sort_order)
    )
    steps = result.scalars().all()
    return {
        "data": [
            {
                "id": str(s.id),
                "stepName": s.step_name,
                "httpMethod": s.http_method,
                "url": s.url,
                "status": s.status,
                "statusCode": s.status_code,
                "durationMs": s.duration_ms,
                "sortOrder": s.sort_order,
                "errorSummary": s.error_summary,
                "requestData": s.request_data,
                "responseData": s.response_data,
                "assertions": s.assertions,
            }
            for s in steps
        ]
    }
