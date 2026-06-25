"""MCP 工具 — 测试用例 + 文件夹"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import case_service
from app.services.folder_service import list_folder_tree


def _case_to_dict(c) -> dict:
    return {
        "id": str(c.id),
        "caseCode": c.case_code,
        "title": c.title,
        "type": c.type,
        "priority": c.priority,
        "folderId": str(c.folder_id) if c.folder_id else None,
        "preconditions": c.preconditions,
        "steps": c.steps,
        "expectedResult": c.expected_result,
        "automationStatus": c.automation_status,
        "source": c.source,
    }


async def list_cases(
    session: AsyncSession,
    branch_id: str,
    page: int = 1,
    page_size: int = 50,
    keyword: str | None = None,
    folder_id: str | None = None,
    priority: str | None = None,
    case_type: str | None = None,
) -> dict:
    """列出分支下的测试用例，支持分页和筛选。"""
    cases, total = await case_service.list_cases(
        session,
        uuid.UUID(branch_id),
        page=page,
        page_size=min(page_size, 100),
        keyword=keyword,
        folder_id=uuid.UUID(folder_id) if folder_id else None,
        priority=priority,
        case_type=case_type,
    )
    return {
        "cases": [_case_to_dict(c) for c in cases],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


async def get_case(session: AsyncSession, case_id: str) -> dict | None:
    """获取单条用例详情。"""
    case = await case_service.get_case(session, uuid.UUID(case_id))
    if not case:
        return None
    return _case_to_dict(case)


async def create_case(
    session: AsyncSession,
    branch_id: str,
    title: str,
    module: str,
    case_type: str = "api",
    submodule: str | None = None,
    priority: str = "P2",
    preconditions: str | None = None,
    steps: list | None = None,
    expected_result: str | None = None,
) -> dict:
    """创建一条测试用例。自动生成 case_code 和目录。"""
    from app.schemas.case import CreateCaseRequest
    data = CreateCaseRequest(
        title=title,
        type=case_type,
        module=module,
        submodule=submodule,
        priority=priority,
        preconditions=preconditions,
        steps=steps or [],
        expected_result=expected_result,
    )
    case = await case_service.create_case(session, uuid.UUID(branch_id), data)
    return _case_to_dict(case)


async def get_folder_tree(session: AsyncSession, branch_id: str) -> list[dict]:
    """获取用例文件夹树形结构，含每层用例数量。"""
    return await list_folder_tree(session, uuid.UUID(branch_id))
