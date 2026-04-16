import json
import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.core.exceptions import AppError
from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.case import BatchCaseRequest, CaseResponse, CreateCaseRequest, UpdateCaseRequest
from app.schemas.common import MessageResponse
from app.services import case_service, folder_service, import_service

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


@router.post("", status_code=HTTP_201_CREATED)
async def create_case(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: CreateCaseRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """手动创建用例"""
    case = await case_service.create_case(session, branch_id, body)
    return {
        "data": CaseResponse.model_validate(case, from_attributes=True).model_dump(by_alias=True)
    }


@router.get("")
async def list_cases(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    case_type: str | None = Query(default=None, alias="type"),
    folder_id: uuid.UUID | None = Query(default=None, alias="folderId"),
    priority: str | None = Query(default=None),
    automation_status: str | None = Query(default=None, alias="automationStatus"),
    is_flaky: bool | None = Query(default=None, alias="isFlaky"),
    keyword: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """用例列表（分页 + 多条件筛选）"""
    cases, total = await case_service.list_cases(
        session, branch_id, page, page_size,
        case_type=case_type, folder_id=folder_id, priority=priority,
        automation_status=automation_status, is_flaky=is_flaky, keyword=keyword,
    )
    return {
        "data": [
            CaseResponse.model_validate(c, from_attributes=True).model_dump(by_alias=True)
            for c in cases
        ],
        "pagination": {"page": page, "pageSize": page_size, "total": total},
    }


@router.get("/{case_id}")
async def get_case(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """用例详情"""
    case = await case_service.get_case(session, case_id)
    return {
        "data": CaseResponse.model_validate(case, from_attributes=True).model_dump(by_alias=True)
    }


@router.put("/{case_id}")
async def update_case(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    body: UpdateCaseRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """更新用例"""
    case = await case_service.update_case(session, case_id, body)
    return {
        "data": CaseResponse.model_validate(case, from_attributes=True).model_dump(by_alias=True)
    }


@router.post("/batch")
async def batch_cases(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: BatchCaseRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """批量操作用例（移动/归档/取消归档/修改优先级/标记Flaky）"""
    result = await case_service.batch_cases(
        session, branch_id,
        action=body.action,
        case_ids=body.case_ids,
        folder_id=body.folder_id,
        priority=body.priority,
    )
    return {"data": result}


# ---- 用例目录 ----

folders_router = APIRouter(
    prefix="/api/projects/{project_id}/branches/{branch_id}/folders", tags=["folders"]
)


@folders_router.get("")
async def list_folders(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """目录树（含用例计数）"""
    tree = await folder_service.list_folder_tree(session, branch_id)
    return {"data": tree}


@folders_router.post("", status_code=HTTP_201_CREATED)
async def create_folder(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    name: str = Query(..., min_length=1, max_length=100),
    parent_id: uuid.UUID | None = Query(default=None, alias="parentId"),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """创建模块/子模块目录"""
    folder = await folder_service.create_folder(session, branch_id, name, parent_id)
    return {"data": folder}


@folders_router.delete("/{folder_id}")
async def delete_folder(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    folder_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin")),
):
    """删除空目录"""
    await folder_service.delete_folder(session, folder_id)
    return MessageResponse(message="删除成功").model_dump()
