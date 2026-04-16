"""用例目录服务 — 树形查询、创建、删除"""
import uuid

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.case import Case, CaseFolder


async def list_folder_tree(session: AsyncSession, branch_id: uuid.UUID) -> list[dict]:
    """返回目录树（含每个节点的用例计数）。

    返回格式: [{ id, name, path, depth, caseCount, children: [...] }, ...]
    """
    # 查所有目录
    result = await session.execute(
        select(CaseFolder)
        .where(CaseFolder.branch_id == branch_id)
        .order_by(CaseFolder.depth, CaseFolder.sort_order, CaseFolder.name)
    )
    folders = result.scalars().all()

    # 统计每个 folder 下的用例数
    count_result = await session.execute(
        select(Case.folder_id, func.count(Case.id))
        .where(Case.branch_id == branch_id, Case.deleted_at.is_(None))
        .group_by(Case.folder_id)
    )
    count_map = {row[0]: row[1] for row in count_result.all()}

    # 构建树
    node_map = {}
    roots = []

    for f in folders:
        node = {
            "id": str(f.id),
            "name": f.name,
            "path": f.path,
            "depth": f.depth,
            "caseCount": count_map.get(f.id, 0),
            "children": [],
        }
        node_map[f.id] = node

        if f.parent_id and f.parent_id in node_map:
            node_map[f.parent_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


async def create_folder(
    session: AsyncSession,
    branch_id: uuid.UUID,
    name: str,
    parent_id: uuid.UUID | None = None,
) -> dict:
    """创建目录（模块或子模块）。"""
    name_upper = name.upper()

    if parent_id:
        # 子目录：查父目录获取 path 和 depth
        result = await session.execute(
            select(CaseFolder).where(CaseFolder.id == parent_id)
        )
        parent = result.scalar_one_or_none()
        if parent is None:
            raise NotFoundError(code="FOLDER_NOT_FOUND", message="父目录不存在")
        path = f"{parent.path}/{name_upper}"
        depth = parent.depth + 1
    else:
        # 顶级模块
        path = name_upper
        depth = 1

    if depth > 4:
        raise ValidationError(code="MAX_DEPTH", message="目录最多 4 层")

    # 检查同分支下 path 是否重复
    existing = await session.execute(
        select(CaseFolder).where(
            CaseFolder.branch_id == branch_id,
            CaseFolder.path == path,
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError(code="FOLDER_EXISTS", message="目录已存在")

    folder = CaseFolder(
        branch_id=branch_id,
        parent_id=parent_id,
        name=name_upper,
        path=path,
        depth=depth,
    )
    session.add(folder)
    await session.flush()
    await session.refresh(folder)

    return {
        "id": str(folder.id),
        "name": folder.name,
        "path": folder.path,
        "depth": folder.depth,
        "caseCount": 0,
        "children": [],
    }


async def delete_folder(session: AsyncSession, folder_id: uuid.UUID) -> None:
    """删除空目录。有用例时拒绝。"""
    result = await session.execute(
        select(CaseFolder).where(CaseFolder.id == folder_id)
    )
    folder = result.scalar_one_or_none()
    if folder is None:
        raise NotFoundError(code="FOLDER_NOT_FOUND", message="目录不存在")

    # 检查是否有用例
    case_count = await session.execute(
        select(func.count(Case.id)).where(
            Case.folder_id == folder_id,
            Case.deleted_at.is_(None),
        )
    )
    count = case_count.scalar_one()
    if count > 0:
        raise ValidationError(
            code="FOLDER_NOT_EMPTY",
            message=f"该目录下存在 {count} 条用例，请先移动或删除",
        )

    # 检查是否有子目录
    child_count = await session.execute(
        select(func.count(CaseFolder.id)).where(CaseFolder.parent_id == folder_id)
    )
    if child_count.scalar_one() > 0:
        raise ValidationError(
            code="FOLDER_HAS_CHILDREN",
            message="该目录下存在子目录，请先删除子目录",
        )

    await session.delete(folder)
    await session.flush()
