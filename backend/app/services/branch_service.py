import uuid

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.project import Branch
from app.schemas.branch import CreateBranchRequest, UpdateBranchRequest


async def list_branches(session: AsyncSession, project_id: uuid.UUID) -> list[Branch]:
    """查询项目下所有分支配置，活跃的在前。"""
    stmt = (
        select(Branch)
        .where(Branch.project_id == project_id)
        .order_by(Branch.status, Branch.created_at)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def create_branch(
    session: AsyncSession, project_id: uuid.UUID, data: CreateBranchRequest
) -> Branch:
    """创建分支配置。名称项目内唯一。"""
    branch = Branch(
        project_id=project_id,
        name=data.name,
        description=data.description,
        branch=data.branch,
    )
    session.add(branch)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError(code="BRANCH_NAME_EXISTS", message="分支配置名称已存在")
    await session.refresh(branch)
    return branch


async def _get_branch(session: AsyncSession, branch_id: uuid.UUID) -> Branch:
    """根据 ID 获取分支，不存在抛 404。"""
    result = await session.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise NotFoundError(code="BRANCH_NOT_FOUND", message="分支配置不存在")
    return branch


async def update_branch(
    session: AsyncSession, branch_id: uuid.UUID, data: UpdateBranchRequest
) -> Branch:
    """更新分支配置（name 不可改）。"""
    branch = await _get_branch(session, branch_id)
    if data.description is not None:
        branch.description = data.description
    if data.branch is not None:
        branch.branch = data.branch
    await session.flush()
    await session.refresh(branch)
    return branch


async def _count_active_branches(session: AsyncSession, project_id: uuid.UUID) -> int:
    """统计项目中活跃分支数量。"""
    result = await session.execute(
        select(func.count()).where(
            Branch.project_id == project_id,
            Branch.status == "active",
        )
    )
    return result.scalar_one()


async def archive_branch(session: AsyncSession, branch_id: uuid.UUID) -> Branch:
    """归档分支配置。最后一个活跃分支不可归档。"""
    branch = await _get_branch(session, branch_id)
    if branch.status == "archived":
        raise ValidationError(code="ALREADY_ARCHIVED", message="分支已处于归档状态")
    count = await _count_active_branches(session, branch.project_id)
    if count <= 1:
        raise ValidationError(code="LAST_ACTIVE_BRANCH", message="项目至少保留一个活跃分支配置")
    branch.status = "archived"
    await session.flush()
    await session.refresh(branch)
    return branch


async def activate_branch(session: AsyncSession, branch_id: uuid.UUID) -> Branch:
    """恢复已归档的分支配置。"""
    branch = await _get_branch(session, branch_id)
    if branch.status == "active":
        raise ValidationError(code="ALREADY_ACTIVE", message="分支已处于活跃状态")
    branch.status = "active"
    await session.flush()
    await session.refresh(branch)
    return branch
