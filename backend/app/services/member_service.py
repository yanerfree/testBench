import uuid

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.audit import audit_log
from app.models.project import ProjectMember
from app.models.user import User
from app.schemas.project import AddMemberRequest, UpdateMemberRequest


async def list_members(session: AsyncSession, project_id: uuid.UUID) -> list[dict]:
    """查询项目成员列表（含用户名）。返回 dict 列表供 MemberResponse 使用。"""
    stmt = (
        select(ProjectMember, User.username)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at)
    )
    result = await session.execute(stmt)
    return [
        {
            "id": member.id,
            "user_id": member.user_id,
            "username": username,
            "role": member.role,
            "joined_at": member.joined_at,
        }
        for member, username in result.all()
    ]


@audit_log(action="create", target_type="project_member")
async def add_member(
    session: AsyncSession, project_id: uuid.UUID, data: AddMemberRequest
) -> dict:
    """添加成员到项目。重复绑定抛 409。"""
    # 先确认用户存在
    user_result = await session.execute(select(User).where(User.id == data.user_id))
    if user_result.scalar_one_or_none() is None:
        raise NotFoundError(code="USER_NOT_FOUND", message="用户不存在")

    member = ProjectMember(
        project_id=project_id,
        user_id=data.user_id,
        role=data.role,
    )
    session.add(member)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError(code="MEMBER_EXISTS", message="该用户已是项目成员")

    await session.refresh(member)
    user = (await session.execute(select(User).where(User.id == data.user_id))).scalar_one()
    return {
        "id": member.id,
        "user_id": member.user_id,
        "username": user.username,
        "role": member.role,
        "joined_at": member.joined_at,
    }


async def _get_member(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember:
    """获取指定成员记录，不存在抛 404。"""
    result = await session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise NotFoundError(code="MEMBER_NOT_FOUND", message="成员不存在")
    return member


async def _count_project_admins(session: AsyncSession, project_id: uuid.UUID) -> int:
    """统计项目中 project_admin 角色的数量。"""
    result = await session.execute(
        select(func.count()).where(
            ProjectMember.project_id == project_id,
            ProjectMember.role == "project_admin",
        )
    )
    return result.scalar_one()


@audit_log(action="update", target_type="project_member")
async def update_member_role(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, data: UpdateMemberRequest
) -> dict:
    """修改成员角色。若降级最后一个 project_admin 则 422。"""
    member = await _get_member(session, project_id, user_id)

    # 如果当前是 project_admin 且要改为其他角色，检查是否是最后一个
    if member.role == "project_admin" and data.role != "project_admin":
        count = await _count_project_admins(session, project_id)
        if count <= 1:
            raise ValidationError(
                code="LAST_ADMIN",
                message="项目至少需要一个管理员",
            )

    member.role = data.role
    await session.flush()
    await session.refresh(member)
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
    return {
        "id": member.id,
        "user_id": member.user_id,
        "username": user.username,
        "role": member.role,
        "joined_at": member.joined_at,
    }


@audit_log(action="delete", target_type="project_member")
async def remove_member(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """移除成员。若是最后一个 project_admin 则 422。"""
    member = await _get_member(session, project_id, user_id)

    if member.role == "project_admin":
        count = await _count_project_admins(session, project_id)
        if count <= 1:
            raise ValidationError(
                code="LAST_ADMIN",
                message="项目至少需要一个管理员",
            )

    await session.delete(member)
    await session.flush()
