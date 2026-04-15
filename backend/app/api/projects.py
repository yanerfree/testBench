import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import get_current_user, require_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.project import CreateProjectRequest, ProjectResponse, UpdateProjectRequest
from app.services import project_service

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
