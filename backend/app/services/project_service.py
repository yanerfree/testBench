import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.project import Branch, Project, ProjectMember
from app.models.user import User
from app.schemas.project import CreateProjectRequest, UpdateProjectRequest


async def create_project(
    session: AsyncSession, data: CreateProjectRequest, creator: User
) -> Project:
    """创建项目 + 默认 branch + 将创建者加入 project_members。"""
    project = Project(
        name=data.name,
        description=data.description,
        git_url=data.git_url,
        script_base_path=data.script_base_path,
    )
    session.add(project)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError(code="PROJECT_NAME_EXISTS", message="项目名称已存在")

    # 默认分支配置
    default_branch = Branch(
        project_id=project.id,
        name="default",
        branch="main",
    )
    session.add(default_branch)

    # 创建者自动加入为 project_admin
    member = ProjectMember(
        project_id=project.id,
        user_id=creator.id,
        role="project_admin",
    )
    session.add(member)
    await session.flush()
    await session.refresh(project)
    return project


async def list_projects(session: AsyncSession, current_user: User) -> list[Project]:
    """查询项目列表。admin 看全部，普通用户看已绑定的。"""
    if current_user.role == "admin":
        stmt = select(Project).order_by(Project.created_at.desc())
    else:
        stmt = (
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == current_user.id)
            .order_by(Project.created_at.desc())
        )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_project(session: AsyncSession, project_id: uuid.UUID) -> Project:
    """根据 ID 获取项目，不存在抛 NotFoundError。"""
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise NotFoundError(code="PROJECT_NOT_FOUND", message="项目不存在")
    return project


async def update_project(
    session: AsyncSession, project_id: uuid.UUID, data: UpdateProjectRequest
) -> Project:
    """更新项目信息。"""
    project = await get_project(session, project_id)
    if data.description is not None:
        project.description = data.description
    if data.git_url is not None:
        project.git_url = data.git_url
    if data.script_base_path is not None:
        project.script_base_path = data.script_base_path
    await session.flush()
    await session.refresh(project)
    return project


async def delete_project(session: AsyncSession, project_id: uuid.UUID) -> None:
    """删除项目（CASCADE 自动清理 branches 和 project_members）。"""
    project = await get_project(session, project_id)
    await session.delete(project)
    await session.flush()
