import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.case import Case
from app.schemas.case import CreateCaseRequest, UpdateCaseRequest
from app.services.import_service import _get_or_create_folder, _next_case_code


async def create_case(
    session: AsyncSession, branch_id: uuid.UUID, data: CreateCaseRequest
) -> Case:
    """手动创建用例。自动生成 case_code，自动创建目录。"""
    folder_id, _, _ = await _get_or_create_folder(
        session, branch_id, data.module, data.submodule
    )
    case_code = await _next_case_code(session, branch_id, data.module)

    case = Case(
        branch_id=branch_id,
        case_code=case_code,
        title=data.title,
        type=data.type,
        folder_id=folder_id,
        priority=data.priority,
        preconditions=data.preconditions,
        steps=data.steps,
        expected_result=data.expected_result,
        source="manual",
        automation_status="pending",
        script_ref_file=data.script_ref_file,
        script_ref_func=data.script_ref_func,
        remark=data.remark,
    )
    session.add(case)
    await session.flush()
    await session.refresh(case)
    return case


async def get_case(session: AsyncSession, case_id: uuid.UUID) -> Case:
    """根据 ID 获取用例详情。"""
    result = await session.execute(
        select(Case).where(Case.id == case_id, Case.deleted_at.is_(None))
    )
    case = result.scalar_one_or_none()
    if case is None:
        raise NotFoundError(code="CASE_NOT_FOUND", message="用例不存在")
    return case


async def update_case(
    session: AsyncSession, case_id: uuid.UUID, data: UpdateCaseRequest
) -> Case:
    """更新用例。"""
    case = await get_case(session, case_id)

    if data.title is not None:
        case.title = data.title
    if data.type is not None:
        case.type = data.type
    if data.priority is not None:
        case.priority = data.priority
    if data.preconditions is not None:
        case.preconditions = data.preconditions
    if data.steps is not None:
        case.steps = data.steps
    if data.expected_result is not None:
        case.expected_result = data.expected_result
    if data.script_ref_file is not None:
        case.script_ref_file = data.script_ref_file
    if data.script_ref_func is not None:
        case.script_ref_func = data.script_ref_func
    if data.is_flaky is not None:
        case.is_flaky = data.is_flaky
    if data.remark is not None:
        case.remark = data.remark

    # module 变更时更新 folder
    if data.module is not None:
        folder_id, _, _ = await _get_or_create_folder(
            session, case.branch_id, data.module, data.submodule
        )
        case.folder_id = folder_id

    await session.flush()
    await session.refresh(case)
    return case


async def list_cases(
    session: AsyncSession,
    branch_id: uuid.UUID,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Case], int]:
    """分页查询用例列表（未删除的）。返回 (cases, total)。"""
    base = select(Case).where(
        Case.branch_id == branch_id,
        Case.deleted_at.is_(None),
    )

    # 总数
    from sqlalchemy import func
    count_result = await session.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar_one()

    # 分页
    stmt = base.order_by(Case.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(stmt)
    cases = list(result.scalars().all())

    return cases, total
