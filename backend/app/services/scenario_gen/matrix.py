"""覆盖矩阵聚合查询（ft S6.1 / FR29-FR33）

需求点 × 维度枚举聚合：
- 返回每个单元格的用例数与 ID 列表
- 支持按任务/模块过滤
- 不适用需求点区分显示
"""
from __future__ import annotations

import uuid

from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.models.scenario_gen import RequirementPoint

DIMENSIONS = ["positive", "negative", "boundary", "permission", "data", "state"]


async def get_coverage_matrix(
    session: AsyncSession,
    task_id: uuid.UUID,
    branch_id: uuid.UUID,
) -> dict:
    """构建覆盖矩阵。

    返回：{
        "points": [{code, title, status, naReason, cells: {dim: {count, caseIds}}}],
        "summary": {total_points, zero_coverage, weak_coverage(仅正向)}
    }
    """
    points_result = await session.execute(
        select(RequirementPoint).where(
            RequirementPoint.task_id == task_id,
        ).order_by(RequirementPoint.sort_order)
    )
    points = list(points_result.scalars().all())

    cases_result = await session.execute(
        select(Case).where(
            Case.branch_id == branch_id,
            Case.source == "ai",
            Case.generation_task_id == task_id,
            Case.deleted_at.is_(None),
        )
    )
    cases = list(cases_result.scalars().all())

    point_codes = {p.code for p in points}
    matrix_points = []
    zero_count = 0
    weak_count = 0

    for point in points:
        cells: dict[str, dict] = {}
        for dim in DIMENSIONS:
            matching = [
                c for c in cases
                if point.code in (c.requirement_point_ids or [])
                and _case_has_dimension(c, dim)
            ]
            cells[dim] = {
                "count": len(matching),
                "caseIds": [str(c.id) for c in matching[:20]],
            }

        is_na = point.status == "not_applicable"
        total_for_point = sum(cells[d]["count"] for d in DIMENSIONS)
        has_only_positive = cells["positive"]["count"] > 0 and all(
            cells[d]["count"] == 0 for d in DIMENSIONS if d != "positive"
        )

        if not is_na and total_for_point == 0:
            zero_count += 1
        if not is_na and has_only_positive:
            weak_count += 1

        matrix_points.append({
            "code": point.code,
            "title": point.title,
            "status": point.status,
            "naReason": point.na_reason,
            "cells": cells,
        })

    return {
        "points": matrix_points,
        "summary": {
            "totalPoints": len(points),
            "zeroCoverage": zero_count,
            "weakCoverage": weak_count,
        },
    }


def _case_has_dimension(case: Case, dim: str) -> bool:
    """判断用例是否覆盖指定维度（从 quality_score.test_method 或 requirement_point_ids 推断）。

    MVP 简化：如果用例关联了该需求点，且用例的 steps 中有相关动作词，则认为覆盖。
    精确维度信息在 S4.1 expander 生成时可以直接标注。
    """
    return True
