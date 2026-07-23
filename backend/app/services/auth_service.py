import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import UnauthorizedError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    verify_password,
)
from app.models.refresh_token import RefreshToken
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


async def issue_token_pair(session: AsyncSession, user: User) -> tuple[str, str]:
    """签发一对令牌：短期 access JWT + 长期 refresh token（明文返回，库里只存哈希）。"""
    access = create_access_token(user.id, user.role)
    raw_refresh = generate_refresh_token()
    record = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(record)
    await session.flush()
    return access, raw_refresh


async def revoke_all_user_tokens(session: AsyncSession, user_id: uuid.UUID) -> None:
    """吊销某用户全部未吊销的 refresh token（用于登出、改密、重放检测）。"""
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )


async def rotate_refresh_token(session: AsyncSession, raw: str) -> tuple[str, str, User]:
    """轮换 refresh token：校验旧 token → 签发新对 → 旧 token 标记吊销并记链路。

    失败一律抛 UnauthorizedError。命中一个已吊销的 token 视为重放/盗用，
    立即吊销该用户全部活跃 token。
    """
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw))
    )
    record = result.scalar_one_or_none()

    if record is None:
        raise UnauthorizedError(code="INVALID_REFRESH_TOKEN", message="登录已过期，请重新登录")

    # 重放检测：收到已吊销的 refresh token，吊销该用户全部活跃 token
    if record.revoked_at is not None:
        await revoke_all_user_tokens(session, record.user_id)
        # 必须显式提交：get_db 在异常时会 rollback，否则连坐吊销会被回滚
        await session.commit()
        raise UnauthorizedError(code="REFRESH_TOKEN_REUSED", message="登录状态异常，请重新登录")

    if record.expires_at <= datetime.now(timezone.utc):
        raise UnauthorizedError(code="REFRESH_TOKEN_EXPIRED", message="登录已过期，请重新登录")

    user = await session.get(User, record.user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError(code="USER_DISABLED", message="用户已禁用")

    access = create_access_token(user.id, user.role)
    raw_refresh = generate_refresh_token()
    new_record = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(new_record)
    await session.flush()

    record.revoked_at = datetime.now(timezone.utc)
    record.replaced_by_id = new_record.id
    await session.flush()

    return access, raw_refresh, user

