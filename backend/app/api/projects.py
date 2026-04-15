import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import get_current_user, require_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.project import (
    AddMemberRequest,
    CreateProjectRequest,
    MemberResponse,
    ProjectResponse,
    UpdateMemberRequest,
    UpdateProjectRequest,
)
from app.services import member_service, project_service

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", status_code=HTTP_201_CREATED)
async def create_project(
    body: CreateProjectRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """创建项目（仅 admin）"""
    project = await project_service.create_project(session, body, current_user)
    return {
        "data": ProjectResponse.model_validate(project, from_attributes=True).model_dump(by_alias=True)
    }


@router.get("")
async def list_projects(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """项目列表（admin 全部，普通用户仅看绑定的）"""
    projects = await project_service.list_projects(session, current_user)
    return {
        "data": [
            ProjectResponse.model_validate(p, from_attributes=True).model_dump(by_alias=True)
            for p in projects
        ]
    }


@router.put("/{project_id}")
async def update_project(
    project_id: uuid.UUID,
    body: UpdateProjectRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """更新项目（仅 admin）"""
    project = await project_service.update_project(session, project_id, body)
    return {
        "data": ProjectResponse.model_validate(project, from_attributes=True).model_dump(by_alias=True)
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """删除项目（仅 admin）"""
    await project_service.delete_project(session, project_id)
    return MessageResponse(message="删除成功").model_dump()


# ---- 项目成员管理 ----


@router.get("/{project_id}/members")
async def list_members(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """查看项目成员列表（仅 admin）"""
    members = await member_service.list_members(session, project_id)
    return {
        "data": [
            MemberResponse(**m).model_dump(by_alias=True) for m in members
        ]
    }


@router.post("/{project_id}/members", status_code=HTTP_201_CREATED)
async def add_member(
    project_id: uuid.UUID,
    body: AddMemberRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """添加项目成员（仅 admin）"""
    member = await member_service.add_member(session, project_id, body)
    return {"data": MemberResponse(**member).model_dump(by_alias=True)}


@router.put("/{project_id}/members/{user_id}")
async def update_member_role(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    body: UpdateMemberRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """修改成员角色（仅 admin）"""
    member = await member_service.update_member_role(session, project_id, user_id, body)
    return {"data": MemberResponse(**member).model_dump(by_alias=True)}


@router.delete("/{project_id}/members/{user_id}")
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("admin")),
):
    """移除项目成员（仅 admin）"""
    await member_service.remove_member(session, project_id, user_id)
    return MessageResponse(message="移除成功").model_dump()
