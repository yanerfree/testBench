"""计划执行服务 — 启动执行、手动录入、确认完成"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.case import Case
from app.models.plan import Plan, PlanCase
from app.models.report import TestReport, TestReportScenario


async def start_execution(
    session: AsyncSession, plan_id: uuid.UUID, executed_by: uuid.UUID
) -> TestReport:
    """启动计划执行 — 创建 report + scenarios，计划状态改为 executing。"""
    # 加载计划
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError(code="PLAN_NOT_FOUND", message="计划不存在")
    if plan.status != "draft":
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可执行")

    # 加载关联用例
    pc_result = await session.execute(
        select(PlanCase, Case)
        .join(Case, Case.id == PlanCase.case_id)
        .where(PlanCase.plan_id == plan_id)
        .order_by(PlanCase.sort_order)
    )
    plan_cases = pc_result.all()
    if not plan_cases:
        raise ValidationError(code="NO_CASES", message="计划中没有用例")

    # 创建报告
    now = datetime.now(timezone.utc)
    report = TestReport(
        plan_id=plan_id,
        environment_id=plan.environment_id,
        executed_by=executed_by,
        executed_at=now,
        total_scenarios=len(plan_cases),
        manual_count=len(plan_cases),
    )
    session.add(report)
    await session.flush()

    # 创建每条用例的 scenario 记录
    for i, (pc, case) in enumerate(plan_cases):
        scenario = TestReportScenario(
            report_id=report.id,
            case_id=case.id,
            case_code=case.case_code,
            scenario_name=case.title,
            status="pending",
            execution_type="manual",
            sort_order=i,
        )
        session.add(scenario)

    # 更新计划状态
    plan.status = "executing"
    plan.executed_at = now
    await session.flush()
    await session.refresh(report)
    return report


async def record_manual_result(
    session: AsyncSession,
    report_id: uuid.UUID,
    scenario_id: uuid.UUID,
    status: str,
    remark: str | None = None,
    duration_ms: int | None = None,
) -> TestReportScenario:
    """录入单条手动测试结果。"""
    result = await session.execute(
        select(TestReportScenario).where(
            TestReportScenario.id == scenario_id,
            TestReportScenario.report_id == report_id,
        )
    )
    scenario = result.scalar_one_or_none()
    if scenario is None:
        raise NotFoundError(code="SCENARIO_NOT_FOUND", message="测试场景不存在")

    scenario.status = status
    scenario.remark = remark
    scenario.duration_ms = duration_ms
    await session.flush()
    await session.refresh(scenario)
    return scenario


async def complete_execution(session: AsyncSession, plan_id: uuid.UUID) -> Plan:
    """确认完成 — 计算汇总，更新计划状态为 completed。"""
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError(code="PLAN_NOT_FOUND", message="计划不存在")
    if plan.status != "executing":
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可完成")

    # 获取报告
    report_result = await session.execute(
        select(TestReport).where(TestReport.plan_id == plan_id).order_by(TestReport.created_at.desc())
    )
    report = report_result.scalars().first()
    if report is None:
        raise ValidationError(code="NO_REPORT", message="未找到执行报告")

    # 汇总 scenario 结果
    stats = await session.execute(
        select(TestReportScenario.status, func.count())
        .where(TestReportScenario.report_id == report.id)
        .group_by(TestReportScenario.status)
    )
    status_counts = {row[0]: row[1] for row in stats.all()}

    report.passed = status_counts.get("passed", 0)
    report.failed = status_counts.get("failed", 0)
    report.error = status_counts.get("error", 0)
    report.skipped = status_counts.get("skipped", 0)
    report.completed_at = datetime.now(timezone.utc)

    # 计算通过率
    denominator = report.passed + report.failed + report.error
    if denominator > 0:
        report.pass_rate = Decimal(str(round(report.passed / denominator * 100, 2)))

    # 更新计划状态
    plan.status = "completed"
    plan.completed_at = report.completed_at
    await session.flush()
    await session.refresh(plan)
    return plan


async def get_report_with_scenarios(
    session: AsyncSession, plan_id: uuid.UUID
) -> dict:
    """获取计划的执行报告 + 场景列表。"""
    report_result = await session.execute(
        select(TestReport).where(TestReport.plan_id == plan_id).order_by(TestReport.created_at.desc())
    )
    report = report_result.scalars().first()
    if report is None:
        return None

    scenarios_result = await session.execute(
        select(TestReportScenario)
        .where(TestReportScenario.report_id == report.id)
        .order_by(TestReportScenario.sort_order)
    )
    scenarios = scenarios_result.scalars().all()

    return {"report": report, "scenarios": scenarios}
