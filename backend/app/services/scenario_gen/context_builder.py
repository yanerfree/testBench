"""自动归类 + 风格样板（ft S4.5 / FR17/FR20/FR58）

- 自动归类：按需求结构建文件夹（或用户手选）
- 风格样板：查已审核用例作 few-shot（approved-only 防污染循环）
"""
from __future__ import annotations

import uuid

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, CaseFolder


async def get_or_create_folder(
    session: AsyncSession,
    branch_id: uuid.UUID,
    module_name: str,
) -> uuid.UUID:
    """获取或创建模块文件夹，返回 folder_id"""
    path = f"/{module_name}"
    result = await session.execute(
        select(CaseFolder).where(
            CaseFolder.branch_id == branch_id,
            CaseFolder.path == path,
        )
    )
    folder = result.scalar_one_or_none()
    if folder:
        return folder.id

    folder = CaseFolder(
        branch_id=branch_id,
        name=module_name,
        path=path,
        depth=1,
        sort_order=0,
    )
    session.add(folder)
    await session.flush()
    return folder.id


async def get_style_samples(
    session: AsyncSession,
    branch_id: uuid.UUID,
    module: str | None = None,
    limit: int = 3,
) -> list[dict]:
    """获取已审核用例作为风格样板（FR58 approved-only）。

    只取 status=approved 的用例，防未审核内容形成污染循环。
    """
    conditions = [
        Case.branch_id == branch_id,
        Case.review_status == "approved",
        Case.deleted_at.is_(None),
    ]

    result = await session.execute(
        select(Case.title, Case.steps, Case.expected_result, Case.preconditions)
        .where(and_(*conditions))
        .order_by(Case.updated_at.desc())
        .limit(limit)
    )
    return [
        {
            "title": row.title,
            "steps": row.steps,
            "expected_result": row.expected_result,
            "preconditions": row.preconditions,
        }
        for row in result.all()
    ]


def build_style_context(samples: list[dict]) -> str:
    """将样板用例构建为 prompt 上下文"""
    if not samples:
        return ""
    lines = ["以下是该项目已审核通过的优质用例示例，请参考其步骤粒度与措辞风格：\n"]
    for i, s in enumerate(samples, 1):
        lines.append(f"【示例 {i}】{s['title']}")
        if s.get("steps"):
            for j, step in enumerate(s["steps"][:5], 1):
                action = step.get("action", "") if isinstance(step, dict) else str(step)
                lines.append(f"  步骤{j}: {action}")
        if s.get("expected_result"):
            lines.append(f"  预期: {s['expected_result'][:100]}")
        lines.append("")
    return "\n".join(lines)
