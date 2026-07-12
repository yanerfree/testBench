"""
批量执行（Ad-hoc）后台任务 — 不走测试计划，直接执行选中的用例并生成报告。

流程: 加载用例 → 合并变量 → 创建沙箱 → 逐条执行 → 写入结果 → 清理沙箱 → 汇总
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import anyio
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.engine.task_status import set_task_status
from app.models.case import Case
from app.models.environment import EnvironmentVariable, GlobalVariable
from app.models.project import Branch, Project
from app.models.report import TestReport, TestReportScenario, TestReportStep

logger = logging.getLogger(__name__)

_execution_semaphore = asyncio.Semaphore(6)
_EXECUTION_TIMEOUT = 600


async def run_adhoc_execution(
    task_id: str,
    report_id: str,
    case_ids: list[str],
    env_id: str,
    test_type: str,
    project_id: str,
    branch_id: str,
    user_id: str,
) -> dict:
    async with _execution_semaphore:
        try:
            return await asyncio.wait_for(
                _run_adhoc_inner(task_id, report_id, case_ids, env_id, test_type, project_id, branch_id, user_id),
                timeout=_EXECUTION_TIMEOUT,
            )
        except asyncio.TimeoutError:
            await set_task_status(task_id, "failed", message=f"执行超时（{_EXECUTION_TIMEOUT}s）")
            return {"error": "timeout"}


async def _run_adhoc_inner(
    task_id: str, report_id: str, case_ids: list[str],
    env_id: str, test_type: str, project_id: str, branch_id: str, user_id: str,
) -> dict:
    await set_task_status(task_id, "running", message="正在准备执行环境...")

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as session:
            result = await _execute_adhoc(
                session, task_id, report_id, case_ids, env_id, test_type, project_id, branch_id,
            )
            await session.commit()
            return result
    except Exception as e:
        logger.exception("Adhoc execution task failed")
        await set_task_status(task_id, "failed", message=f"执行异常: {str(e)[:200]}")
        return {"error": str(e)}
    finally:
        await engine.dispose()


async def _execute_adhoc(
    session: AsyncSession, task_id: str, report_id: str,
    case_ids: list[str], env_id: str, test_type: str,
    project_id: str, branch_id: str,
) -> dict:
    from app.engine.executor import execute_single_case
    from app.engine.sandbox import cleanup_sandbox, create_sandbox
    from app.services.environment_service import get_merged_variables

    rid = uuid.UUID(report_id)

    project = (await session.execute(
        select(Project).where(Project.id == uuid.UUID(project_id))
    )).scalar_one()
    branch = (await session.execute(
        select(Branch).where(Branch.id == uuid.UUID(branch_id))
    )).scalar_one()

    cases = (await session.execute(
        select(Case).where(Case.id.in_([uuid.UUID(c) for c in case_ids]))
    )).scalars().all()

    env_vars = {}
    if env_id:
        merged = await get_merged_variables(session, uuid.UUID(env_id))
        env_vars = {v["key"]: v["value"] for v in merged}
        report = (await session.execute(select(TestReport).where(TestReport.id == rid))).scalar_one()
        report.variables_snapshot = merged
        await session.flush()

    # 判断哪些用例有脚本
    executable = []
    for case in cases:
        has_script = bool(case.script_ref_file) if test_type == "api" else bool(case.script_ref_file)
        if has_script and case.automation_status == "automated":
            executable.append(case)

    # 创建沙箱（如果有可执行用例且项目配置了脚本路径）
    sandbox_dir = None
    bare_repo = None
    use_sandbox = bool(project.script_base_path and branch.last_commit_sha and executable)

    if use_sandbox:
        bare_repo = Path(project.script_base_path) / ".repos" / "repo.git"
        execution_id = str(rid)
        sandbox_dir = Path(project.script_base_path) / ".sandboxes" / execution_id

        await set_task_status(task_id, "running", message="正在创建执行沙箱...")
        try:
            await anyio.to_thread.run_sync(
                lambda: create_sandbox(bare_repo, sandbox_dir, branch.last_commit_sha)
            )
        except Exception as e:
            await set_task_status(task_id, "failed", message=f"创建沙箱失败: {str(e)[:200]}")
            return {"error": str(e)}

    total = len(cases)
    executed = 0
    passed = 0
    failed = 0

    try:
        for i, case in enumerate(cases):
            scenario = (await session.execute(
                select(TestReportScenario).where(
                    TestReportScenario.report_id == rid,
                    TestReportScenario.case_id == case.id,
                )
            )).scalar_one_or_none()
            if scenario is None:
                continue

            if case not in executable:
                continue

            await set_task_status(
                task_id, "running",
                message=f"执行中 ({i+1}/{total}): {case.title[:50]}"
            )

            scenario.status = "running"
            scenario.started_at = datetime.now(timezone.utc)
            await session.commit()

            case_result = await anyio.to_thread.run_sync(
                lambda c=case: execute_single_case(
                    sandbox_dir=str(sandbox_dir) if sandbox_dir else None,
                    script_ref_file=c.script_ref_file,
                    script_ref_func=c.script_ref_func,
                    env_vars=env_vars,
                    timeout=300,
                )
            )

            case_completed = datetime.now(timezone.utc)
            scenario.status = case_result["status"]
            scenario.duration_ms = case_result["duration_ms"]
            scenario.error_summary = case_result.get("error_summary")
            scenario.execution_log = (case_result.get("stdout") or "")[:10000]
            scenario.completed_at = case_completed
            scenario.execution_type = "automated"
            await session.flush()

            for j, step in enumerate(case_result.get("steps", [])):
                session.add(TestReportStep(
                    scenario_id=scenario.id,
                    step_name=step.get("step_name"),
                    step_label=step.get("step_label"),
                    step_phase=step.get("step_phase"),
                    status=step.get("status", "passed"),
                    http_method=step.get("http_method"),
                    url=step.get("url"),
                    status_code=step.get("status_code"),
                    duration_ms=step.get("duration_ms"),
                    sort_order=j,
                    request_data=step.get("request_data"),
                    response_data=step.get("response_data"),
                    assertions=step.get("assertions"),
                    error_summary=step.get("error_summary"),
                ))
            await session.commit()

            executed += 1
            if case_result["status"] == "passed":
                passed += 1
            elif case_result["status"] in ("failed", "error"):
                failed += 1

    finally:
        if sandbox_dir and bare_repo:
            await set_task_status(task_id, "running", message="正在清理执行沙箱...")
            try:
                await anyio.to_thread.run_sync(
                    lambda: cleanup_sandbox(bare_repo, sandbox_dir)
                )
            except Exception:
                logger.exception("Failed to cleanup sandbox: %s", sandbox_dir)

    # 汇总报告
    report = (await session.execute(select(TestReport).where(TestReport.id == rid))).scalar_one()
    skipped_count = total - len(executable)
    report.total_scenarios = total
    report.passed = passed
    report.failed = failed
    report.error = 0
    report.skipped = skipped_count
    report.manual_count = 0
    report.completed_at = datetime.now(timezone.utc)
    denominator = passed + failed
    report.pass_rate = Decimal(str(round(passed / denominator * 100, 2))) if denominator > 0 else None
    total_duration = sum(
        s.duration_ms or 0
        for s in (await session.execute(
            select(TestReportScenario).where(TestReportScenario.report_id == rid)
        )).scalars().all()
    )
    report.total_duration_ms = total_duration
    await session.flush()

    result_data = {
        "executed": executed, "passed": passed, "failed": failed,
        "skipped": skipped_count, "total": total,
    }
    await set_task_status(
        task_id, "completed",
        message=f"执行完成: {passed} 通过 / {failed} 失败 / {skipped_count} 跳过",
        result=result_data,
    )
    return result_data
