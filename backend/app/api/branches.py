import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.branch import BranchResponse, CreateBranchRequest, UpdateBranchRequest
from app.services import branch_service

router = APIRouter(prefix="/api/projects/{project_id}/branches", tags=["branches"])


@router.get("")
async def list_branches(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """分支配置列表（项目成员均可查看）"""
    branches = await branch_service.list_branches(session, project_id)
    return {
        "data": [
            BranchResponse.model_validate(b, from_attributes=True).model_dump(by_alias=True)
            for b in branches
        ]
    }


@router.post("", status_code=HTTP_201_CREATED)
async def create_branch(
    project_id: uuid.UUID,
    body: CreateBranchRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """创建分支配置（project_admin 或系统 admin）"""
    branch = await branch_service.create_branch(session, project_id, body)
    return {
        "data": BranchResponse.model_validate(branch, from_attributes=True).model_dump(by_alias=True)
    }


@router.put("/{branch_id}")
async def update_branch(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: UpdateBranchRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """更新分支配置（name 不可改）"""
    branch = await branch_service.update_branch(session, branch_id, body)
    return {
        "data": BranchResponse.model_validate(branch, from_attributes=True).model_dump(by_alias=True)
    }


@router.post("/{branch_id}/archive")
async def archive_branch(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """归档分支配置"""
    branch = await branch_service.archive_branch(session, branch_id)
    return {
        "data": BranchResponse.model_validate(branch, from_attributes=True).model_dump(by_alias=True)
    }


@router.post("/{branch_id}/activate")
async def activate_branch(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """恢复已归档的分支配置"""
    branch = await branch_service.activate_branch(session, branch_id)
    return {
        "data": BranchResponse.model_validate(branch, from_attributes=True).model_dump(by_alias=True)
    }
