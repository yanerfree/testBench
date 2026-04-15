import uuid
from collections.abc import Callable

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.deps.db import get_db
from app.models.user import User


async def get_current_user(request: Request, session: AsyncSession = Depends(get_db)) -> User:
    """从 Authorization header 提取 token，解码后查库返回 User 对象。"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise UnauthorizedError(code="MISSING_TOKEN", message="未提供认证凭据")

    token = auth_header[7:]  # 去掉 "Bearer " 前缀
    claims = decode_token(token)  # 失败时内部抛 UnauthorizedError

    user_id = claims.get("sub")
    if not user_id:
        raise UnauthorizedError(code="INVALID_TOKEN", message="token 无效或已过期")

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise UnauthorizedError(code="INVALID_TOKEN", message="token 无效或已过期")

    result = await session.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise UnauthorizedError(code="USER_DISABLED", message="用户已禁用")

    return user


def require_role(*roles: str) -> Callable:
    """角色检查依赖工厂。用法: Depends(require_role("admin"))"""
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise ForbiddenError(code="ROLE_DENIED", message="无权限执行此操作")
        return current_user
    return _check
