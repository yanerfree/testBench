"""
test_create_user_duplicate — 用户名重复返回 409
Test ID: 1.3-API-003
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestCreateUserDuplicate:
    """POST /api/users：用户名重复时返回 409 错误"""

    @pytest.mark.asyncio
    async def test_duplicate_username_returns_409(self, client, db_session):
        # Given: 数据库中已存在同名用户
        admin = await create_test_user(db_session, username="dup_admin", role="admin")
        await create_test_user(db_session, username="existing_user", role="user")
        headers, _ = make_auth_headers(admin)

        # When: 再次创建同名用户
        response = await client.post("/api/users", headers=headers, json={
            "username": "existing_user",
            "password": "AnyPass123",
            "role": "user",
        })

        # Then: 返回 409
        assert response.status_code == 409
        error = response.json()["error"]
        assert error["code"] == "USERNAME_EXISTS"
