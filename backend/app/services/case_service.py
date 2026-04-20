import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.audit import audit_log
from app.models.case import Case
from app.schemas.case import CreateCaseRequest, UpdateCaseRequest
from app.services.import_service import _get_or_create_folder, _next_case_code


@audit_log(action="create", target_type="case")
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


@audit_log(action="update", target_type="case")
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
    case_type: str | None = None,
    folder_id: uuid.UUID | None = None,
    priority: str | None = None,
    automation_status: str | None = None,
    is_flaky: bool | None = None,
    keyword: str | None = None,
) -> tuple[list[Case], int]:
    """分页查询用例列表（未删除的），支持多条件筛选。返回 (cases, total)。"""
    from sqlalchemy import func, or_

    base = select(Case).where(
        Case.branch_id == branch_id,
        Case.deleted_at.is_(None),
    )

    if case_type:
        base = base.where(Case.type == case_type)
    if folder_id:
        # 查该目录及所有子目录下的用例
        from app.services.folder_service import _collect_descendant_ids
        descendant_ids = await _collect_descendant_ids(session, folder_id)
        all_ids = [folder_id] + descendant_ids
        base = base.where(Case.folder_id.in_(all_ids))
    if priority:
        base = base.where(Case.priority == priority)
    if automation_status:
        base = base.where(Case.automation_status == automation_status)
    if is_flaky is not None:
        base = base.where(Case.is_flaky == is_flaky)
    if keyword:
        like = f"%{keyword}%"
        base = base.where(or_(Case.title.ilike(like), Case.case_code.ilike(like)))

    # 总数
    count_result = await session.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar_one()

    # 分页
    stmt = base.order_by(Case.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(stmt)
    cases = list(result.scalars().all())

    return cases, total


async def batch_cases(
    session: AsyncSession,
    branch_id: uuid.UUID,
    action: str,
    case_ids: list[uuid.UUID],
    folder_id: uuid.UUID | None = None,
    priority: str | None = None,
) -> dict:
    """批量操作用例。返回 { succeeded, failed, errors }。"""
    succeeded = 0
    failed = 0
    errors = []

    for cid in case_ids:
        result = await session.execute(
            select(Case).where(Case.id == cid, Case.branch_id == branch_id, Case.deleted_at.is_(None))
        )
        case = result.scalar_one_or_none()
        if case is None:
            failed += 1
            errors.append(f"{cid}: 用例不存在")
            continue

        # 已归档用例只允许 unarchive 操作
        if case.automation_status == "archived" and action != "unarchive":
            failed += 1
            errors.append(f"{case.case_code}: 已归档用例不可操作")
            continue

        if action == "move":
            case.folder_id = folder_id
        elif action == "archive":
            case.automation_status = "archived"
        elif action == "unarchive":
            case.automation_status = "pending"
        elif action == "set_priority":
            case.priority = priority
        elif action == "set_flaky":
            case.is_flaky = True
        elif action == "unset_flaky":
            case.is_flaky = False
        elif action == "delete":
            case.deleted_at = datetime.now(timezone.utc)
            case.folder_id = None

        succeeded += 1

    await session.flush()
    return {"succeeded": succeeded, "failed": failed, "errors": errors}


@audit_log(action="delete", target_type="case")
async def delete_case(session: AsyncSession, case_id: uuid.UUID) -> None:
    """软删除用例（标记 deleted_at）。"""
    case = await get_case(session, case_id)
    case.deleted_at = datetime.now(timezone.utc)
    await session.flush()


async def copy_cases_from_branch(
    session: AsyncSession,
    target_branch_id: uuid.UUID,
    source_branch_id: uuid.UUID,
    case_ids: list[uuid.UUID],
) -> dict:
    """跨分支复制用例（深拷贝）。返回 { copied: N }。"""
    from app.services.import_service import _get_or_create_folder, _next_case_code
    from app.models.case import CaseFolder

    copied = 0
    for cid in case_ids:
        result = await session.execute(
            select(Case).where(Case.id == cid, Case.branch_id == source_branch_id, Case.deleted_at.is_(None))
        )
        source = result.scalar_one_or_none()
        if source is None:
            continue

        # 获取源用例的 module 信息（从 folder path 反推）
        module = None
        submodule = None
        if source.folder_id:
            folder_result = await session.execute(
                select(CaseFolder).where(CaseFolder.id == source.folder_id)
            )
            folder = folder_result.scalar_one_or_none()
            if folder:
                parts = folder.path.split("/")
                module = parts[0] if len(parts) >= 1 else None
                submodule = parts[1] if len(parts) >= 2 else None

        # 在目标分支创建目录 + 生成新 case_code
        folder_id = None
        if module:
            folder_id, _, _ = await _get_or_create_folder(session, target_branch_id, module, submodule)
        case_code = await _next_case_code(session, target_branch_id, module or "UNKNOWN")

        new_case = Case(
            branch_id=target_branch_id,
            case_code=case_code,
            title=source.title,
            type=source.type,
            folder_id=folder_id,
            priority=source.priority,
            preconditions=source.preconditions,
            steps=source.steps,
            expected_result=source.expected_result,
            source=source.source,
            automation_status="pending",
            script_ref_file=source.script_ref_file,
            script_ref_func=source.script_ref_func,
            remark=source.remark,
        )
        session.add(new_case)
        copied += 1

    await session.flush()
    return {"copied": copied}
