import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.script import Script


async def create_script(
    session: AsyncSession,
    case_id: uuid.UUID,
    script_type: str,
    content: str,
    file_name: str | None = None,
    func_name: str | None = None,
    language: str = "python",
    source: str = "manual",
    commit_sha: str | None = None,
    created_by: uuid.UUID | None = None,
) -> Script:
    """创建新版本脚本。自动递增 version，将旧 active 版本归档。"""
    # 如果内容与当前 active 版本相同，跳过
    current = await get_active_script(session, case_id, script_type)
    if current and current.content == content:
        return current

    # 获取最大 version
    result = await session.execute(
        select(func.max(Script.version)).where(
            Script.case_id == case_id,
            Script.script_type == script_type,
        )
    )
    max_ver = result.scalar_one_or_none() or 0

    # 将旧 active 改为 archived
    if current:
        current.status = "archived"

    script = Script(
        case_id=case_id,
        script_type=script_type,
        version=max_ver + 1,
        language=language,
        content=content,
        file_name=file_name,
        func_name=func_name,
        status="active",
        source=source,
        commit_sha=commit_sha,
        created_by=created_by,
    )
    session.add(script)
    await session.flush()
    return script


async def get_active_script(
    session: AsyncSession,
    case_id: uuid.UUID,
    script_type: str,
) -> Script | None:
    """获取当前 active 版本的脚本。"""
    result = await session.execute(
        select(Script).where(
            Script.case_id == case_id,
            Script.script_type == script_type,
            Script.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def list_versions(
    session: AsyncSession,
    case_id: uuid.UUID,
    script_type: str,
) -> list[Script]:
    """列出指定用例+类型的所有版本，按版本号倒序。"""
    result = await session.execute(
        select(Script).where(
            Script.case_id == case_id,
            Script.script_type == script_type,
        ).order_by(Script.version.desc())
    )
    return list(result.scalars().all())


async def get_script_by_id(
    session: AsyncSession,
    script_id: uuid.UUID,
) -> Script | None:
    result = await session.execute(
        select(Script).where(Script.id == script_id)
    )
    return result.scalar_one_or_none()


async def activate_version(
    session: AsyncSession,
    script_id: uuid.UUID,
) -> Script | None:
    """将指定版本设为 active，其他同 case+type 的版本归档。"""
    script = await get_script_by_id(session, script_id)
    if not script:
        return None

    # 归档同 case+type 的其他 active 版本
    result = await session.execute(
        select(Script).where(
            Script.case_id == script.case_id,
            Script.script_type == script.script_type,
            Script.status == "active",
            Script.id != script_id,
        )
    )
    for old in result.scalars().all():
        old.status = "archived"

    script.status = "active"
    await session.flush()
    return script
