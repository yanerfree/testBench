"""
Root conftest.py — 共享 fixtures for all test levels.

Fixtures:
    - db_engine / db_session: 异步数据库连接（事务回滚隔离）
    - client: httpx.AsyncClient（绑定 FastAPI app）
    - admin_token: 预置 admin 用户的 JWT token
"""
import asyncio
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.config import settings
from app.main import app
from app.deps.db import get_session
from app.models.user import Base


# Use a separate test database
TEST_DATABASE_URL = settings.database_url.replace("/testbench", "/testbench_test")


@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop for the entire test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def db_engine():
    """Create a test database engine (session scope)."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Per-test database session with transaction rollback."""
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """httpx.AsyncClient bound to FastAPI app with overridden DB session."""

    async def _override_session():
        yield db_session

    app.dependency_overrides[get_session] = _override_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
