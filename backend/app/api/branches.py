import uuid

from arq import ArqRedis
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED, HTTP_202_ACCEPTED

from app.core.exceptions import NotFoundError, ValidationError
from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.deps.worker import get_arq_pool
from app.engine.task_status import set_task_status
from app.models.project import Branch, Project
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


@router.post("/{branch_id}/sync", status_code=HTTP_202_ACCEPTED)
async def sync_branch_endpoint(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    pool: ArqRedis = Depends(get_arq_pool),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """
    同步分支脚本（更新脚本）— 异步任务。

    返回 202 + taskId，前端通过 GET /api/tasks/{taskId}/status 轮询进度。
    """
    # 1. 加载 branch + project 做前置校验
    result = await session.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if branch is None:
        raise NotFoundError(code="BRANCH_NOT_FOUND", message="分支配置不存在")

    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise NotFoundError(code="PROJECT_NOT_FOUND", message="项目不存在")

    if not project.git_url:
        raise ValidationError(code="NO_GIT_URL", message="项目未配置 Git 仓库地址")
    if not project.script_base_path:
        raise ValidationError(code="NO_SCRIPT_PATH", message="项目未配置脚本基础路径")
    if branch.status == "archived":
        raise ValidationError(code="BRANCH_ARCHIVED", message="已归档的分支不能同步")

    # 2. 提交异步任务
    task_id = uuid.uuid4().hex
    await set_task_status(task_id, "pending", message="任务已提交，等待 Worker 执行...")
    await pool.enqueue_job(
        "run_git_sync",
        task_id,
        str(branch_id),
        str(project_id),
    )

    return {"data": {"taskId": task_id}}
