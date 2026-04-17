"""Integration 测试 — services/user_service.py（需要 DB）"""
import pytest
from sqlalchemy import select

from app.core.exceptions import ConflictError, NotFoundError
from app.models.user import User
from app.schemas.user import CreateUserRequest, UpdateUserRequest
from app.services import user_service
from tests.conftest import create_test_user


class TestUserServiceCreate:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_create_user_hashes_password(self, db_session):
        req = CreateUserRequest(username="svc_user1", password="Test@123456", role="user")
        user = await user_service.create_user(db_session, req)
        assert user.username == "svc_user1"
        assert user.password != "Test@123456"
        assert user.password.startswith(("$2b$", "$2a$"))

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_create_duplicate_raises_conflict(self, db_session):
        req = CreateUserRequest(username="svc_dup", password="Test@123456", role="user")
        await user_service.create_user(db_session, req)
        with pytest.raises(ConflictError):
            await user_service.create_user(db_session, req)


class TestUserServiceList:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_list_returns_all(self, db_session):
        await create_test_user(db_session, username="svc_list1")
        await create_test_user(db_session, username="svc_list2")
        users = await user_service.list_users(db_session)
        assert len(users) >= 2


class TestUserServiceUpdate:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_update_role(self, db_session):
        user = await create_test_user(db_session, username="svc_upd")
        req = UpdateUserRequest(role="admin")
        updated = await user_service.update_user(db_session, user.id, req)
        assert updated.role == "admin"

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_update_nonexistent_raises_404(self, db_session):
        import uuid
        req = UpdateUserRequest(role="admin")
        with pytest.raises(NotFoundError):
            await user_service.update_user(db_session, uuid.uuid4(), req)


class TestUserServiceDelete:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_delete_user(self, db_session):
        user = await create_test_user(db_session, username="svc_del")
        await user_service.delete_user(db_session, user.id)
        result = await db_session.execute(select(User).where(User.id == user.id))
        assert result.scalar_one_or_none() is None
