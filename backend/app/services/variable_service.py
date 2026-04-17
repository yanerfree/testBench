"""全局变量服务"""
import uuid

from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.audit import audit_log
from app.models.environment import GlobalVariable

RESERVED_VAR_NAMES = frozenset({
    "PATH", "HOME", "USER", "SHELL", "LANG", "LC_ALL", "LC_CTYPE",
    "PYTHONPATH", "PYTHONHOME", "PYTHONIOENCODING",
    "LD_LIBRARY_PATH", "LD_PRELOAD",
    "TMPDIR", "TEMP", "TMP",
    "DISPLAY", "TERM", "HOSTNAME",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
})


def _check_reserved(key: str) -> None:
    if key.upper() in RESERVED_VAR_NAMES:
        raise ValidationError(code="RESERVED_KEY", message=f"「{key}」为系统保留变量，不允许覆盖")


async def list_variables(session: AsyncSession) -> list[GlobalVariable]:
    result = await session.execute(
        select(GlobalVariable).order_by(GlobalVariable.sort_order, GlobalVariable.key)
    )
    return list(result.scalars().all())


@audit_log(action="create", target_type="global_variable")
async def create_variable(session: AsyncSession, key: str, value: str, description: str | None = None) -> GlobalVariable:
    _check_reserved(key)
    var = GlobalVariable(key=key, value=value, description=description)
    session.add(var)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError(code="VAR_KEY_EXISTS", message="变量名已存在")
    await session.refresh(var)
    return var


async def update_variable(session: AsyncSession, var_id: uuid.UUID, value: str, description: str | None = None) -> GlobalVariable:
    result = await session.execute(select(GlobalVariable).where(GlobalVariable.id == var_id))
    var = result.scalar_one_or_none()
    if var is None:
        raise NotFoundError(code="VAR_NOT_FOUND", message="变量不存在")
    var.value = value
    if description is not None:
        var.description = description
    await session.flush()
    await session.refresh(var)
    return var


@audit_log(action="delete", target_type="global_variable")
async def delete_variable(session: AsyncSession, var_id: uuid.UUID) -> None:
    result = await session.execute(select(GlobalVariable).where(GlobalVariable.id == var_id))
    var = result.scalar_one_or_none()
    if var is None:
        raise NotFoundError(code="VAR_NOT_FOUND", message="变量不存在")
    await session.delete(var)
    await session.flush()


async def put_variables(session: AsyncSession, variables: list[dict]) -> list[GlobalVariable]:
    """全量替换全局变量（一次请求搞定）。"""
    for v in variables:
        _check_reserved(v["key"])

    # 删除所有旧变量
    await session.execute(delete(GlobalVariable))

    # 写入新变量
    new_vars = []
    for i, v in enumerate(variables):
        gv = GlobalVariable(
            key=v["key"],
            value=v["value"],
            description=v.get("description"),
            sort_order=i,
        )
        session.add(gv)
        new_vars.append(gv)

    await session.flush()
    for v in new_vars:
        await session.refresh(v)
    return new_vars
