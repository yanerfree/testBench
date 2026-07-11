"""功能场景测试 MCP 工具（与 test_cases/api_tests 同层级函数风格）"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession


async def create_scenario_task(
    session: AsyncSession,
    project_id: str,
    branch_id: str,
    title: str,
    content_markdown: str,
) -> dict:
    """创建功能场景测试生成任务"""
    from app.models.scenario_gen import GenerationTask, RequirementDoc
    from app.services.scenario_gen import pipeline
    from app.services.scenario_gen.preprocessor import preprocess
    from app.services.scenario_gen import runner as gen_runner

    pid, bid = uuid.UUID(project_id), uuid.UUID(branch_id)
    doc = RequirementDoc(
        project_id=pid, branch_id=bid,
        source="mcp", content_markdown=content_markdown,
        content_meta=preprocess(content_markdown),
    )
    session.add(doc)
    await session.flush()

    task = GenerationTask(
        project_id=pid, branch_id=bid,
        doc_id=doc.id, title=title[:200],
        status="extracting",
    )
    session.add(task)
    await session.flush()
    await pipeline.emit_event(session, task.id, "task_state", {"status": "extracting"})
    await session.commit()

    pipeline.spawn(gen_runner.run_extraction(task.id, pid), name=f"mcp-extract-{task.id}", gen_task_id=task.id)

    return {"task_id": str(task.id), "status": "extracting", "message": "任务已创建，AI 正在提取需求点"}


async def get_scenario_task(
    session: AsyncSession,
    task_id: str,
) -> dict:
    """查询生成任务状态与进度"""
    from app.models.scenario_gen import GenerationTask
    task = await session.get(GenerationTask, uuid.UUID(task_id))
    if not task:
        return {"error": "任务不存在"}
    return {
        "task_id": str(task.id),
        "title": task.title,
        "status": task.status,
        "progress": task.progress,
        "error_message": task.error_message,
    }


async def query_coverage_matrix(
    session: AsyncSession,
    task_id: str,
    branch_id: str,
) -> dict:
    """查询覆盖矩阵"""
    from app.services.scenario_gen.matrix import get_coverage_matrix
    return await get_coverage_matrix(session, uuid.UUID(task_id), uuid.UUID(branch_id))


async def get_generation_stats(
    session: AsyncSession,
    branch_id: str,
) -> dict:
    """查询生成质量统计"""
    from sqlalchemy import func, select
    from app.models.case import Case

    bid = uuid.UUID(branch_id)
    base = [Case.branch_id == bid, Case.source == "ai", Case.deleted_at.is_(None)]
    total = (await session.execute(select(func.count(Case.id)).where(*base))).scalar_one()
    approved = (await session.execute(select(func.count(Case.id)).where(*base, Case.review_status == "approved"))).scalar_one()
    rejected = (await session.execute(select(func.count(Case.id)).where(*base, Case.review_status == "rejected"))).scalar_one()
    return {
        "total": total, "approved": approved, "rejected": rejected,
        "approval_rate": round(approved / total * 100, 1) if total > 0 else 0,
    }


async def confirm_and_generate(
    session: AsyncSession,
    task_id: str,
) -> dict:
    """确认需求点和场景模型，自动推进到用例展开。一步到位完成整个流水线。"""
    from sqlalchemy import select, func
    from app.models.scenario_gen import GenerationTask, RequirementPoint, ScenarioModel
    from app.services.scenario_gen import pipeline
    from app.services.scenario_gen import runner as gen_runner
    from app.deps.db import async_session_factory
    from datetime import datetime, timezone

    tid = uuid.UUID(task_id)
    task = await session.get(GenerationTask, tid)
    if not task:
        return {"error": "任务不存在"}

    # 如果还在 extracting，等一下
    if task.status == "extracting":
        return {"task_id": task_id, "status": "extracting", "message": "需求点还在提取中，请稍后再调用此工具"}

    # model_ready → 确认需求点 → 触发建模
    if task.status == "model_ready":
        points_count = (await session.execute(
            select(func.count(RequirementPoint.id)).where(
                RequirementPoint.task_id == tid,
                RequirementPoint.status == "active",
            )
        )).scalar_one()
        if points_count == 0:
            return {"error": "没有有效需求点，无法继续"}

        # 触发场景模型生成
        pipeline.spawn(gen_runner.run_modeling(tid, task.project_id), name=f"mcp-model-{tid}", gen_task_id=tid)
        return {
            "task_id": task_id, "status": "modeling",
            "points_count": points_count,
            "message": f"已确认 {points_count} 个需求点，正在生成场景模型。请稍后再次调用查看进度。",
        }

    # 场景模型已生成，等待确认 → 直接确认并展开
    result = await session.execute(select(ScenarioModel).where(ScenarioModel.task_id == tid))
    model = result.scalar_one_or_none()

    if task.status == "model_ready" or (model and model.status == "draft"):
        if not model:
            return {"error": "场景模型尚未生成", "status": task.status}
        tp_count = len(model.test_points) if model.test_points else 0
        if tp_count == 0:
            return {"error": "场景模型中无测试点"}

        model.status = "confirmed"
        model.confirmed_at = datetime.now(timezone.utc)
        try:
            await pipeline.transition(session, task, "confirmed")
        except Exception as e:
            return {"error": f"状态推进失败: {e}"}
        await session.commit()

        # 后台触发展开
        async def _start():
            async with async_session_factory() as s:
                t = await s.get(GenerationTask, tid)
                if t and t.status == "confirmed":
                    await pipeline.transition(s, t, "generating")
                    await s.commit()
            await gen_runner.run_expansion(tid, task.project_id)
        pipeline.spawn(_start(), name=f"mcp-expand-{tid}", gen_task_id=tid)

        return {
            "task_id": task_id, "status": "generating",
            "test_points": tp_count,
            "message": f"已确认场景模型（{tp_count} 个测试点），正在批量展开用例。",
        }

    # 已经在 generating/completed/failed
    return {
        "task_id": task_id,
        "status": task.status,
        "progress": task.progress,
        "message": f"当前状态: {task.status}" + (f"，进度: {task.progress}" if task.progress else ""),
    }
