"""初始管理员 seed 脚本 — 幂等执行"""
import asyncio

from sqlalchemy import select

from app.config import settings
from app.core.security import hash_password
from app.deps.db import async_session_factory
from app.models.user import User


async def seed_admin():
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        existing = result.scalar_one_or_none()
        if existing:
            print("Admin user already exists, skipping.")
            return
        admin = User(
            username="admin",
            password=hash_password(settings.admin_default_password),
            role="admin",
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        print("Admin user created successfully.")


if __name__ == "__main__":
    asyncio.run(seed_admin())
