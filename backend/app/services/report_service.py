"""报告服务 — 汇总视图 + 模块分组"""
import uuid

from sqlalchemy import select, func, case as sa_case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, CaseFolder
from app.models.report import TestReport, TestReportScenario


async def get_report_dashboard(session: AsyncSession, plan_id: uuid.UUID) -> dict | None:
    """获取报告仪表盘数据（L1 汇总 + L2 模块分组）。

    返回: { summary: {...}, modules: [...] } 或 None
    """
    # 获取最新报告
    result = await session.execute(
        select(TestReport).where(TestReport.plan_id == plan_id).order_by(TestReport.created_at.desc())
    )
    report = result.scalars().first()
    if report is None:
        return None

    # L1 汇总
    summary = {
        "reportId": str(report.id),
        "planId": str(report.plan_id),
        "executedAt": report.executed_at.isoformat() if report.executed_at else None,
        "completedAt": report.completed_at.isoformat() if report.completed_at else None,
        "totalScenarios": report.total_scenarios,
        "passed": report.passed,
        "failed": report.failed,
        "error": report.error,
        "skipped": report.skipped,
        "passRate": float(report.pass_rate) if report.pass_rate is not None else None,
        "totalDurationMs": report.total_duration_ms,
        "manualCount": report.manual_count,
    }

    # 计算待录入数
    pending_result = await session.execute(
        select(func.count()).where(
            TestReportScenario.report_id == report.id,
            TestReportScenario.status == "pending",
        )
    )
    summary["pending"] = pending_result.scalar_one()

    # L2 按模块分组
    # scenario → case → folder → 取 path 的第一段作为模块名
    module_stats = await session.execute(
        select(
            CaseFolder.name,
            func.count(TestReportScenario.id).label("total"),
            func.sum(sa_case((TestReportScenario.status == "passed", 1), else_=0)).label("passed"),
            func.sum(sa_case((TestReportScenario.status == "failed", 1), else_=0)).label("failed"),
            func.sum(sa_case((TestReportScenario.status == "error", 1), else_=0)).label("error"),
            func.sum(sa_case((TestReportScenario.status == "pending", 1), else_=0)).label("pending"),
        )
        .join(Case, Case.id == TestReportScenario.case_id, isouter=True)
        .join(CaseFolder, CaseFolder.id == Case.folder_id, isouter=True)
        .where(TestReportScenario.report_id == report.id)
        .group_by(CaseFolder.name)
    )

    modules = []
    for row in module_stats.all():
        name = row.name or "未分类"
        total = row.total or 0
        passed = row.passed or 0
        failed = row.failed or 0
        denominator = passed + failed + (row.error or 0)
        pass_rate = round(passed / denominator * 100, 2) if denominator > 0 else None

        modules.append({
            "module": name,
            "total": total,
            "passed": passed,
            "failed": failed,
            "error": row.error or 0,
            "pending": row.pending or 0,
            "passRate": pass_rate,
        })

    modules.sort(key=lambda m: m["module"])

    return {"summary": summary, "modules": modules}
