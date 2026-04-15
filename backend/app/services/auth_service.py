from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import verify_password
from app.models.user import User


async def authenticate(session: AsyncSession, username: str, password: str) -> User:
    """验证用户名和密码，返回 User 对象。失败统一抛出 UnauthorizedError（不泄露具体原因）。"""
    stmt = select(User).where(User.username == username)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None or not verify_password(password, user.password):
        raise UnauthorizedError(code="LOGIN_FAILED", message="用户名或密码错误")

    if not user.is_active:
        raise UnauthorizedError(code="LOGIN_FAILED", message="用户名或密码错误")

    return user
