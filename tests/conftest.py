"""
Root conftest.py — 共享 fixtures for all test levels.

Fixtures:
    - db_engine / db_session: 异步数据库连接（每个测试后 rollback）
    - client: httpx.AsyncClient（绑定 FastAPI app）

Helpers:
    - create_test_user(): 在 db_session 中创建用户并返回 User
    - make_auth_headers(): 为用户签发 JWT token 并返回 headers
"""
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.config import settings
from app.core.security import hash_password, create_access_token
from app.main import app
from app.deps.db import get_db
from app.models.user import User, Base
from app.models.project import Project, Branch, ProjectMember  # noqa: F401 — 确保 metadata 包含新表
from app.models.case import CaseFolder, Case  # noqa: F401
from app.models.environment import GlobalVariable, Environment, EnvironmentVariable, NotificationChannel  # noqa: F401
from app.models.plan import Plan, PlanCase  # noqa: F401


# Use a separate test database
TEST_DATABASE_URL = settings.database_url.replace("/testbench", "/testbench_test")

# 测试用固定密码
TEST_PASSWORD = "Test@123456"


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Per-test: 建引擎 → 建表 → 创建 session → yield → rollback → 销毁。
    每个测试完全隔离，不存在 event loop 跨作用域问题。"""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    session = session_factory()
    try:
        yield session
    finally:
        await session.rollback()
        await session.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """httpx.AsyncClient bound to FastAPI app with overridden DB session."""

    async def _override_session():
        yield db_session

    app.dependency_overrides[get_db] = _override_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


async def create_test_user(
    db_session: AsyncSession,
    username: str = "testuser",
    password: str = TEST_PASSWORD,
    role: str = "user",
    is_active: bool = True,
) -> User:
    """在测试中创建用户。直接在测试函数内调用。"""
    user = User(
        username=username,
        password=hash_password(password),
        role=role,
        is_active=is_active,
    )
    db_session.add(user)
    await db_session.flush()
    return user


def make_auth_headers(user: User) -> tuple[dict, str]:
    """为用户签发 JWT token 并返回 (headers_dict, token_str)。"""
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}, token
