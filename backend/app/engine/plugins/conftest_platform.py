"""
Root conftest.py — 共享 fixtures for all test levels.

双模式运行:
  - 平台模式: 环境变量由平台下发 (BASE_URL, DATABASE_URL 等)，走真实 HTTP 请求到目标环境
  - 本地模式: 无平台变量，走 ASGI 进程内测试 (httpx ASGITransport)

规则: 平台下发的环境变量优先，没有则用脚本自己的默认值。
"""
import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.config import settings
from app.core.security import hash_password, create_access_token
from app.main import app
from app.deps.db import get_db
from app.models.user import User, Base
from app.models.project import Project, Branch, ProjectMember  # noqa: F401
from app.models.case import CaseFolder, Case  # noqa: F401
from app.models.environment import GlobalVariable, Environment, EnvironmentVariable, NotificationChannel  # noqa: F401
from app.models.plan import Plan, PlanCase  # noqa: F401
from app.models.report import TestReport, TestReportScenario, TestReportStep  # noqa: F401

# ── 环境变量: 平台下发 > 脚本默认 ──

PLATFORM_BASE_URL = os.environ.get("BASE_URL", "").strip() or None

_default_test_db = settings.database_url.replace("/testbench", "/testbench_test")
TEST_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip() or _default_test_db

TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "Test@123456")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")


# ── Fixtures ──

@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
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
    if not PLATFORM_BASE_URL:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    if PLATFORM_BASE_URL:
        async with AsyncClient(base_url=PLATFORM_BASE_URL, timeout=30) as ac:
            yield ac
    else:
        async def _override_session():
            yield db_session
        app.dependency_overrides[get_db] = _override_session
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
        app.dependency_overrides.clear()


# ── 认证 Helpers ──

async def login_as(client: AsyncClient, username: str = None, password: str = None) -> dict:
    """通过登录接口获取 token，返回 headers dict。两种模式都可用。

    Usage:
        headers = await login_as(client)                          # 用默认管理员
        headers = await login_as(client, "tester", "pass123")     # 指定用户
    """
    username = username or ADMIN_USERNAME
    password = password or ADMIN_PASSWORD
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"login_as({username}) failed: {resp.status_code} {resp.text}"
    token = resp.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


async def create_user_via_api(client: AsyncClient, admin_headers: dict,
                              username: str, password: str = None, role: str = "user") -> dict:
    """通过 API 创建用户，返回用户数据 dict。两种模式都可用。"""
    password = password or TEST_PASSWORD
    resp = await client.post("/api/users", headers=admin_headers, json={
        "username": username, "password": password, "role": role,
    })
    assert resp.status_code == 201, f"create_user_via_api({username}) failed: {resp.status_code} {resp.text}"
    return resp.json()["data"]


# ── 本地模式 Helpers（仅 ASGI 模式下使用，直接操作 DB）──

async def create_test_user(
    db_session: AsyncSession,
    username: str = "testuser",
    password: str = None,
    role: str = "user",
    is_active: bool = True,
) -> User:
    """直接写 DB 创建用户。仅本地模式使用，平台模式请用 create_user_via_api。"""
    password = password or TEST_PASSWORD
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
    """本地签 JWT token。仅本地模式使用，平台模式请用 login_as。"""
    token = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}, token
