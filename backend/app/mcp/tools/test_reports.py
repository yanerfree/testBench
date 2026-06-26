"""MCP 工具 — 测试报告"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.report_service import get_report_dashboard
from app.services.execution_service import get_report_with_scenarios


async def get_report_summary(session: AsyncSession, plan_id: str, report_id: str | None = None) -> dict | None:
    """获取测试报告摘要（通过/失败/跳过/通过率 + 模块级分布）。"""
    return await get_report_dashboard(
        session,
        plan_id=uuid.UUID(plan_id),
        report_id=uuid.UUID(report_id) if report_id else None,
    )


async def get_failed_scenarios(session: AsyncSession, plan_id: str, report_id: str | None = None) -> list[dict]:
    """获取报告中失败的用例场景（含步骤、前置条件、错误信息）。"""
    report = await get_report_with_scenarios(
        session,
        plan_id=uuid.UUID(plan_id),
        report_id=uuid.UUID(report_id) if report_id else None,
    )
    if not report:
        return []

    failed = []
    for s in report.get("scenarios", []):
        if s.get("status") in ("failed", "error"):
            failed.append({
                "scenarioId": str(s.get("id", "")),
                "caseId": str(s.get("case_id", "")),
                "caseTitle": s.get("case_title", ""),
                "status": s.get("status", ""),
                "executionType": s.get("execution_type", ""),
                "remark": s.get("remark", ""),
                "durationMs": s.get("duration_ms"),
                "steps": s.get("_case_steps", []),
                "preconditions": s.get("_preconditions", ""),
                "expectedResult": s.get("_expected_result", ""),
                "scriptFile": s.get("_script_ref_file", ""),
            })
    return failed
