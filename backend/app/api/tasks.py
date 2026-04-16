"""任务状态查询端点 — 前端轮询异步任务进度。"""
from fastapi import APIRouter, Depends

from app.core.exceptions import NotFoundError
from app.deps.auth import get_current_user
from app.engine.task_status import get_task_status
from app.models.user import User

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}/status")
async def query_task_status(
    task_id: str,
    _: User = Depends(get_current_user),
):
    """
    查询异步任务状态。

    状态: pending / running / completed / failed
    completed 时 result 字段包含任务结果。
    """
    status = await get_task_status(task_id)
    if status is None:
        raise NotFoundError(code="TASK_NOT_FOUND", message="任务不存在或已过期")
    return {"data": status}
