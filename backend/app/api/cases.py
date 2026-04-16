import json
import uuid

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.services import import_service

router = APIRouter(prefix="/api/projects/{project_id}/branches/{branch_id}/cases", tags=["cases"])


@router.post("/import")
async def import_cases(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """导入 tea-cases.json 用例文件"""
    # 校验文件后缀
    if not file.filename or not file.filename.endswith(".json"):
        raise AppError(code="INVALID_FILE", message="仅接受 .json 文件", status_code=400)

    # 校验文件大小（50MB）
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise AppError(code="FILE_TOO_LARGE", message="文件大小不能超过 50MB", status_code=400)

    # 解析 JSON
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise AppError(
            code="JSON_PARSE_ERROR",
            message=f"JSON 解析失败：第 {e.lineno} 行",
            status_code=400,
            detail=str(e),
        )

    # 提取 cases 数组
    cases_list = data.get("cases", [])
    if not isinstance(cases_list, list):
        raise AppError(code="INVALID_FORMAT", message="JSON 中缺少 cases 数组", status_code=400)

    # 执行导入
    summary = await import_service.import_cases(session, branch_id, cases_list)

    return {"data": summary}
