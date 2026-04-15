"""
test_create_user — admin 创建用户
Test ID: 1.3-API-002
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestCreateUser:
    """POST /api/users：admin 创建新用户"""

    @pytest.mark.asyncio
    async def test_create_user_success(self, client, db_session):
        # Given: admin 已登录
        admin = await create_test_user(db_session, username="creator_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 创建新用户
        response = await client.post("/api/users", headers=headers, json={
            "username": "new_user_1",
            "password": "SecurePass123",
            "role": "user",
        })

        # Then: 返回 201 和用户信息
        assert response.status_code == 201
        data = response.json()["data"]
        assert data["username"] == "new_user_1"
        assert data["role"] == "user"
        assert data["isActive"] is True
        assert "id" in data
        assert "password" not in data

    @pytest.mark.asyncio
    async def test_create_admin_user(self, client, db_session):
        # Given: admin 已登录
        admin = await create_test_user(db_session, username="creator_admin2", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 创建 admin 角色用户
        response = await client.post("/api/users", headers=headers, json={
            "username": "new_admin_1",
            "password": "SecurePass123",
            "role": "admin",
        })

        # Then: 返回 201，role 为 admin
        assert response.status_code == 201
        assert response.json()["data"]["role"] == "admin"
