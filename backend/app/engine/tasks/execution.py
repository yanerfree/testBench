"""
自动化计划执行 arq 任务。

流程: 加载计划 → 合并变量 → 创建沙箱 → 逐条执行 → 写入结果 → 清理沙箱 → 汇总
"""
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.engine.task_status import set_task_status
from app.models.case import Case
from app.models.plan import Plan, PlanCase
from app.models.project import Branch, Project
from app.models.report import TestReport, TestReportScenario, TestReportStep

logger = logging.getLogger(__name__)


async def run_automated_execution(
    ctx: dict,
    task_id: str,
    plan_id: str,
    report_id: str,
    user_id: str,
) -> dict:
    """arq 任务: 执行自动化测试计划。"""
    await set_task_status(task_id, "running", message="正在准备执行环境...")

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as session:
            result = await _execute(session, task_id, plan_id, report_id)
            await session.commit()
            return result
    except Exception as e:
        logger.exception("Execution task failed")
        await set_task_status(task_id, "failed", message=f"执行异常: {str(e)[:200]}")
        return {"error": str(e)}
    finally:
        await engine.dispose()


async def _execute(session: AsyncSession, task_id: str, plan_id: str, report_id: str) -> dict:
    """执行核心逻辑。"""
    from app.engine.executor import execute_single_case
    from app.engine.sandbox import cleanup_sandbox, create_sandbox
    from app.services.environment_service import get_merged_variables

    pid = uuid.UUID(plan_id)
    rid = uuid.UUID(report_id)

    # 1. 加载 plan + project + branch
    plan = (await session.execute(select(Plan).where(Plan.id == pid))).scalar_one()
    project = (await session.execute(select(Project).where(Project.id == plan.project_id))).scalar_one()

    # 加载关联的用例（通过 PlanCase）
    plan_cases = (await session.execute(
        select(PlanCase, Case)
        .join(Case, PlanCase.case_id == Case.id)
        .where(PlanCase.plan_id == pid)
        .order_by(PlanCase.sort_order)
    )).all()

    if not plan_cases:
        await set_task_status(task_id, "completed", message="无用例可执行")
        return {"executed": 0}

    # 取第一个用例的 branch 来确定 bare repo 和 commit SHA
    first_case = plan_cases[0][1]
    branch = (await session.execute(select(Branch).where(Branch.id == first_case.branch_id))).scalar_one()

    # 2. 合并变量并写入快照
    env_vars = {}
    if plan.environment_id:
        merged = await get_merged_variables(session, plan.environment_id)
        env_vars = {v["key"]: v["value"] for v in merged}
        report = (await session.execute(select(TestReport).where(TestReport.id == rid))).scalar_one()
        report.variables_snapshot = merged
        await session.flush()

    # 3. 创建沙箱
    if not project.script_base_path or not branch.last_commit_sha:
        await set_task_status(task_id, "failed", message="项目未配置脚本路径或分支未同步")
        return {"error": "missing script_base_path or commit_sha"}

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

    # 4. 逐条执行
    total = len(plan_cases)
    executed = 0
    passed = 0
    failed = 0

    try:
        for i, (plan_case, case) in enumerate(plan_cases):
            # 找到对应的 scenario
            scenario = (await session.execute(
                select(TestReportScenario).where(
                    TestReportScenario.report_id == rid,
                    TestReportScenario.case_id == case.id,
                )
            )).scalar_one_or_none()

            if scenario is None:
                continue

            # 跳过非自动化用例
            if case.automation_status != "automated" or not case.script_ref_file:
                scenario.status = "skipped"
                scenario.error_summary = "非自动化用例或脚本引用缺失"
                await session.flush()
                continue

            # Flaky 用例跳过
            if case.is_flaky:
                scenario.status = "skipped"
                scenario.error_summary = "Flaky 用例已跳过"
                await session.flush()
                continue

            await set_task_status(
                task_id, "running",
                message=f"执行中 ({i+1}/{total}): {case.title[:50]}"
            )

            # 在线程中执行 pytest（含重试）
            retry_count = plan.retry_count or 0
            case_result = None
            for attempt in range(retry_count + 1):
                case_result = await anyio.to_thread.run_sync(
                    lambda c=case: execute_single_case(
                        sandbox_dir=str(sandbox_dir),
                        script_ref_file=c.script_ref_file,
                        script_ref_func=c.script_ref_func,
                        env_vars=env_vars,
                        timeout=300,
                    )
                )
                if case_result["status"] == "passed" or attempt == retry_count:
                    break
                # 重试中
                await set_task_status(
                    task_id, "running",
                    message=f"重试中 ({attempt+1}/{retry_count}): {case.title[:50]}"
                )

            # 更新 scenario
            scenario.status = case_result["status"]
            scenario.duration_ms = case_result["duration_ms"]
            scenario.error_summary = case_result.get("error_summary")
            scenario.execution_type = "automated"
            await session.flush()

            # 创建 steps
            for j, step in enumerate(case_result.get("steps", [])):
                session.add(TestReportStep(
                    scenario_id=scenario.id,
                    step_name=step.get("step_name"),
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
            await session.flush()

            executed += 1
            if case_result["status"] == "passed":
                passed += 1
            elif case_result["status"] in ("failed", "error"):
                failed += 1

    finally:
        # 5. 清理沙箱（无论成败）
        await set_task_status(task_id, "running", message="正在清理执行沙箱...")
        try:
            await anyio.to_thread.run_sync(
                lambda: cleanup_sandbox(bare_repo, sandbox_dir)
            )
        except Exception:
            logger.exception("Failed to cleanup sandbox: %s", sandbox_dir)

    # 6. 汇总报告
    from app.services.execution_service import complete_execution
    await complete_execution(session, pid)

    result_data = {
        "executed": executed,
        "passed": passed,
        "failed": failed,
        "total": total,
    }
    await set_task_status(
        task_id, "completed",
        message=f"执行完成: {passed} 通过 / {failed} 失败 / {total} 总计",
        result=result_data,
    )
    return result_data
