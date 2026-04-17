"""用例导入服务 — 解析 tea-cases.json 并导入到指定分支配置"""
import uuid

from sqlalchemy import select, func
from app.core.audit import audit_log
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case, CaseFolder


async def _get_or_create_folder(
    session: AsyncSession,
    branch_id: uuid.UUID,
    module: str,
    submodule: str | None,
) -> tuple[uuid.UUID | None, int, int]:
    """获取或创建 module/submodule 对应的目录。返回 (folder_id, new_modules, new_submodules)。"""
    new_modules = 0
    new_submodules = 0

    if not module:
        return None, 0, 0

    module_upper = module.upper()
    module_path = module_upper

    # 查找或创建 module 目录（depth=1）
    result = await session.execute(
        select(CaseFolder).where(
            CaseFolder.branch_id == branch_id,
            CaseFolder.path == module_path,
        )
    )
    module_folder = result.scalar_one_or_none()
    if module_folder is None:
        module_folder = CaseFolder(
            branch_id=branch_id,
            parent_id=None,
            name=module_upper,
            path=module_path,
            depth=1,
        )
        session.add(module_folder)
        await session.flush()
        new_modules = 1

    if not submodule:
        return module_folder.id, new_modules, 0

    # 查找或创建 submodule 目录（depth=2）
    sub_upper = submodule.upper()
    sub_path = f"{module_path}/{sub_upper}"

    result = await session.execute(
        select(CaseFolder).where(
            CaseFolder.branch_id == branch_id,
            CaseFolder.path == sub_path,
        )
    )
    sub_folder = result.scalar_one_or_none()
    if sub_folder is None:
        sub_folder = CaseFolder(
            branch_id=branch_id,
            parent_id=module_folder.id,
            name=sub_upper,
            path=sub_path,
            depth=2,
        )
        session.add(sub_folder)
        await session.flush()
        new_submodules = 1

    return sub_folder.id, new_modules, new_submodules


async def _next_case_code(
    session: AsyncSession, branch_id: uuid.UUID, module: str
) -> str:
    """生成下一个 case_code: TC-{MODULE}-{seq5}"""
    module_upper = module.upper()
    prefix = f"TC-{module_upper}-"

    # 查询当前分支下该模块的最大序号
    result = await session.execute(
        select(func.max(Case.case_code)).where(
            Case.branch_id == branch_id,
            Case.case_code.like(f"{prefix}%"),
        )
    )
    max_code = result.scalar_one_or_none()

    if max_code:
        try:
            seq = int(max_code.replace(prefix, "")) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:05d}"


async def import_cases(
    session: AsyncSession, branch_id: uuid.UUID, cases_data: list[dict]
) -> dict:
    """导入用例主函数。

    返回摘要: { "new": N, "updated": M, "removed": K, "skipped": L,
                "new_modules": X, "new_submodules": Y, "skipped_reasons": [...] }
    """
    new_count = 0
    updated_count = 0
    skipped_count = 0
    skipped_reasons = []
    total_new_modules = 0
    total_new_submodules = 0

    # 收集本次导入的所有 tea_id
    imported_tea_ids = set()

    for item in cases_data:
        # 校验必填字段
        tea_id = item.get("tea_id")
        title = item.get("title")
        case_type = item.get("type")
        module = item.get("module")

        if not all([tea_id, title, case_type, module]):
            missing = [f for f in ("tea_id", "title", "type", "module") if not item.get(f)]
            skipped_count += 1
            skipped_reasons.append(f"tea_id={tea_id or '?'}: 缺必填字段 {', '.join(missing)}")
            continue

        imported_tea_ids.add(tea_id)

        # 获取或创建目录
        submodule = item.get("submodule")
        folder_id, nm, ns = await _get_or_create_folder(session, branch_id, module, submodule)
        total_new_modules += nm
        total_new_submodules += ns

        # 按 tea_id 查找已有用例
        result = await session.execute(
            select(Case).where(
                Case.branch_id == branch_id,
                Case.tea_id == tea_id,
            )
        )
        existing = result.scalar_one_or_none()

        script_ref = item.get("script_ref", {}) or {}
        priority = item.get("priority", "P2")
        tags = item.get("tags", [])

        if existing is None:
            # 新增
            case_code = await _next_case_code(session, branch_id, module)
            case = Case(
                branch_id=branch_id,
                case_code=case_code,
                tea_id=tea_id,
                title=title,
                type=case_type,
                folder_id=folder_id,
                priority=priority,
                source="imported",
                automation_status="automated" if script_ref.get("file") else "pending",
                script_ref_file=script_ref.get("file"),
                script_ref_func=script_ref.get("func"),
                remark=", ".join(tags) if tags else None,
            )
            session.add(case)
            new_count += 1
        else:
            # 更新元数据
            existing.title = title
            existing.priority = priority
            existing.folder_id = folder_id
            existing.script_ref_file = script_ref.get("file")
            existing.script_ref_func = script_ref.get("func")
            existing.remark = ", ".join(tags) if tags else existing.remark
            if script_ref.get("file"):
                existing.automation_status = "automated"
            updated_count += 1

    await session.flush()

    # 标记本次未出现的已导入用例为 script_removed
    result = await session.execute(
        select(Case).where(
            Case.branch_id == branch_id,
            Case.source == "imported",
            Case.automation_status != "script_removed",
            Case.deleted_at.is_(None),
        )
    )
    all_imported = result.scalars().all()

    removed_count = 0
    for case in all_imported:
        if case.tea_id and case.tea_id not in imported_tea_ids:
            case.automation_status = "script_removed"
            removed_count += 1

    if removed_count > 0:
        await session.flush()

    return {
        "new": new_count,
        "updated": updated_count,
        "removed": removed_count,
        "skipped": skipped_count,
        "new_modules": total_new_modules,
        "new_submodules": total_new_submodules,
        "skipped_reasons": skipped_reasons,
    }
