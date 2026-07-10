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
