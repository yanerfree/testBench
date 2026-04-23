"""测试计划 API"""
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.core.exceptions import AppError, ValidationError
from app.core.audit import write_audit_log
from app.deps.auth import get_current_user, require_project_role
from app.deps.db import get_db
from app.engine.task_status import set_task_status
from app.engine.tasks.execution import run_automated_execution
from app.models.user import User
from app.schemas.common import BaseSchema, MessageResponse
from app.schemas.plan import CreatePlanRequest, UpdatePlanRequest, PlanListItem, PlanResponse
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
                environment_name=it.get("environment_name"),
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
    plan_cases = await plan_service.get_plan_cases(session, plan_id)
    data = PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)
    data["caseIds"] = [str(pc.case_id) for pc in plan_cases]
    return {"data": data}


@router.put("/{plan_id}")
async def update_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: UpdatePlanRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """更新测试计划（仅 draft 状态）"""
    plan = await plan_service.update_plan(session, plan_id, body)
    plan_cases = await plan_service.get_plan_cases(session, plan_id)
    data = PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)
    data["caseIds"] = [str(pc.case_id) for pc in plan_cases]
    return {"data": data}


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
    error_summary: str | None = None
    execution_log: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    remark: str | None
    sort_order: int
    script_ref_file: str | None = None
    script_ref_func: str | None = None

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
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """启动计划执行。

    手动计划: 创建报告 + scenarios，直接返回。
    自动化计划: 创建报告后通过 BackgroundTasks 异步执行，返回 taskId 供轮询。
    """
    report = await execution_service.start_execution(session, plan_id, current_user.id)
    await write_audit_log(session, action="execute", target_type="plan", target_id=plan_id, target_name=None)

    plan = await plan_service.get_plan(session, plan_id)
    if plan.plan_type == "automated":
        await session.commit()
        task_id = uuid.uuid4().hex
        await set_task_status(task_id, "pending", message="自动化执行任务已提交...")
        background_tasks.add_task(
            run_automated_execution, task_id, str(plan_id), str(report.id), str(current_user.id),
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
    await write_audit_log(session, action="complete", target_type="plan", target_id=plan_id, target_name=plan.name)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.get("/{plan_id}/executions")
async def list_plan_executions(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """计划的执行历史列表"""
    from sqlalchemy import select as sa_select
    from app.models.report import TestReport
    result = await session.execute(
        sa_select(TestReport).where(TestReport.plan_id == plan_id).order_by(TestReport.created_at.desc())
    )
    reports = result.scalars().all()
    return {
        "data": [
            {
                "id": str(r.id),
                "executedAt": r.executed_at.isoformat() if r.executed_at else None,
                "completedAt": r.completed_at.isoformat() if r.completed_at else None,
                "totalScenarios": r.total_scenarios,
                "passed": r.passed,
                "failed": r.failed,
                "error": r.error,
                "skipped": r.skipped,
                "passRate": float(r.pass_rate) if r.pass_rate is not None else None,
                "totalDurationMs": r.total_duration_ms,
            }
            for r in reports
        ]
    }


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
                {
                    **ScenarioResponse.model_validate(s, from_attributes=True).model_dump(by_alias=True),
                    "scriptRefFile": getattr(s, '_script_ref_file', None),
                    "scriptRefFunc": getattr(s, '_script_ref_func', None),
                    "caseSteps": getattr(s, '_case_steps', None),
                    "preconditions": getattr(s, '_preconditions', None),
                    "expectedResult": getattr(s, '_expected_result', None),
                }
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


# ---- Story 4.5: 处理人分配 ----

class AssignRequest(BaseSchema):
    scenario_ids: list[uuid.UUID]
    assignee_id: uuid.UUID


@router.put("/{plan_id}/assign")
async def assign_scenarios(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    body: AssignRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """批量分配处理人"""
    from sqlalchemy import select, update
    from app.models.plan import PlanCase
    from app.models.report import TestReportScenario

    for sid in body.scenario_ids:
        # 更新 PlanCase 的 assignee
        scenario = (await session.execute(
            select(TestReportScenario).where(TestReportScenario.id == sid)
        )).scalar_one_or_none()
        if scenario and scenario.case_id:
            await session.execute(
                update(PlanCase).where(
                    PlanCase.plan_id == plan_id,
                    PlanCase.case_id == scenario.case_id,
                ).values(assignee_id=body.assignee_id)
            )
    await session.flush()
    return MessageResponse(message="分配成功").model_dump()


# ---- Story 4.6: 暂停/恢复/终止 ----

@router.post("/{plan_id}/pause")
async def pause_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """手动暂停执行中的计划"""
    plan = await plan_service.get_plan(session, plan_id)
    if plan.status != "executing":
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可暂停")
    plan.status = "paused"
    await session.flush()
    await write_audit_log(session, action="pause", target_type="plan", target_id=plan_id, target_name=plan.name)
    await session.refresh(plan)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.post("/{plan_id}/resume")
async def resume_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """恢复已暂停的计划"""
    plan = await plan_service.get_plan(session, plan_id)
    if plan.status != "paused":
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可恢复")
    plan.status = "executing"
    await session.flush()
    await write_audit_log(session, action="resume", target_type="plan", target_id=plan_id, target_name=plan.name)
    await session.refresh(plan)
    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


@router.post("/{plan_id}/abort")
async def abort_plan(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """终止计划 — 未执行用例标记为 skipped，状态改为 completed"""
    from sqlalchemy import select, update
    from app.models.report import TestReportScenario, TestReport

    plan = await plan_service.get_plan(session, plan_id)
    if plan.status not in ("executing", "paused"):
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可终止")

    # 获取报告
    report = (await session.execute(
        select(TestReport).where(TestReport.plan_id == plan_id).order_by(TestReport.created_at.desc())
    )).scalars().first()

    if report:
        # 未执行的 scenario 标记为 skipped
        await session.execute(
            update(TestReportScenario).where(
                TestReportScenario.report_id == report.id,
                TestReportScenario.status == "pending",
            ).values(status="skipped", error_summary="计划已终止")
        )

    plan.status = "completed"
    plan.completed_at = datetime.now(timezone.utc)
    await session.flush()
    await write_audit_log(session, action="abort", target_type="plan", target_id=plan_id, target_name=plan.name)

    # 汇总报告
    if report:
        await execution_service.complete_execution(session, plan_id)
        await session.refresh(plan)

    return {"data": PlanResponse.model_validate(plan, from_attributes=True).model_dump(by_alias=True)}


# ---- 报告列表（项目级） ----

reports_router = APIRouter(prefix="/api/projects/{project_id}/reports", tags=["reports"])


@reports_router.get("")
async def list_reports(
    project_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """项目下所有执行报告列表"""
    from app.models.report import TestReport
    from app.models.plan import Plan
    from sqlalchemy import func, select

    base = (
        select(TestReport, Plan.name.label("plan_name"), Plan.plan_type, Plan.test_type)
        .join(Plan, Plan.id == TestReport.plan_id)
        .where(Plan.project_id == project_id)
        .order_by(TestReport.created_at.desc())
    )

    count_result = await session.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await session.execute(base.offset((page - 1) * page_size).limit(page_size))
    rows = result.all()

    data = []
    for report, plan_name, plan_type, test_type in rows:
        data.append({
            "id": str(report.id),
            "planId": str(report.plan_id),
            "planName": plan_name,
            "planType": plan_type,
            "testType": test_type,
            "executedAt": report.executed_at.isoformat() if report.executed_at else None,
            "completedAt": report.completed_at.isoformat() if report.completed_at else None,
            "totalScenarios": report.total_scenarios,
            "passed": report.passed,
            "failed": report.failed,
            "error": report.error,
            "skipped": report.skipped,
            "passRate": float(report.pass_rate) if report.pass_rate is not None else None,
            "totalDurationMs": report.total_duration_ms,
        })

    return {"data": data, "pagination": {"page": page, "pageSize": page_size, "total": total}}
