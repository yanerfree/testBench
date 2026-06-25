"""MCP 工具的 DB session 依赖 — 协议调用时自动注入"""
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from app.deps.db import async_session_factory


@asynccontextmanager
async def get_mcp_session():
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
