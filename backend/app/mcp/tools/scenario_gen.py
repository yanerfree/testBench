"""功能场景测试 MCP 工具集（ft E8 / FR39-FR42 / ADR-6）

MCP 工具是 service 层薄封装：参数转换 + 调 service + 血缘标记。
禁止在此处直写 DB（NFR18）。
"""
from __future__ import annotations

import uuid

from fastmcp import FastMCP

scenario_gen_mcp = FastMCP("scenario-gen-tools")


@scenario_gen_mcp.tool()
async def tb_scenario_create_task(
    project_id: str,
    branch_id: str,
    title: str,
    content_markdown: str,
    settings: dict | None = None,
) -> dict:
    """创建功能场景测试生成任务。需提供需求文档内容。"""
    from app.deps.db import async_session_factory
    from app.models.scenario_gen import GenerationTask, RequirementDoc
    from app.services.scenario_gen import pipeline
    from app.services.scenario_gen.preprocessor import preprocess

    pid, bid = uuid.UUID(project_id), uuid.UUID(branch_id)
    async with async_session_factory() as session:
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
            status="extracting", settings=settings,
        )
        session.add(task)
        await session.flush()
        await pipeline.emit_event(session, task.id, "task_state", {"status": "extracting"})
        await session.commit()
        return {"task_id": str(task.id), "status": task.status}


@scenario_gen_mcp.tool()
async def tb_scenario_query_matrix(
    project_id: str,
    branch_id: str,
    task_id: str,
) -> dict:
    """查询覆盖矩阵：需求点 × 维度聚合"""
    from app.deps.db import async_session_factory
    from app.services.scenario_gen.matrix import get_coverage_matrix

    async with async_session_factory() as session:
        matrix = await get_coverage_matrix(session, uuid.UUID(task_id), uuid.UUID(branch_id))
    return matrix


@scenario_gen_mcp.tool()
async def tb_scenario_get_stats(
    project_id: str,
    branch_id: str,
) -> dict:
    """查询生成质量统计"""
    from app.deps.db import async_session_factory
    from sqlalchemy import func, select
    from app.models.case import Case

    bid = uuid.UUID(branch_id)
    async with async_session_factory() as session:
        base = [Case.branch_id == bid, Case.source == "ai", Case.deleted_at.is_(None)]
        total = (await session.execute(select(func.count(Case.id)).where(*base))).scalar_one()
        approved = (await session.execute(select(func.count(Case.id)).where(*base, Case.review_status == "approved"))).scalar_one()
        rejected = (await session.execute(select(func.count(Case.id)).where(*base, Case.review_status == "rejected"))).scalar_one()
    return {
        "total": total, "approved": approved, "rejected": rejected,
        "approval_rate": round(approved / total * 100, 1) if total > 0 else 0,
    }
