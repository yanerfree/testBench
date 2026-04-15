"""
test_me_success — 已登录用户获取自身信息
Test ID: 1.2-API-004
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestMeSuccess:
    """GET /api/auth/me：携带有效 token 返回当前用户信息"""

    @pytest.mark.asyncio
    async def test_me_returns_current_user(self, client, db_session):
        # Given: 已登录的 admin 用户
        admin = await create_test_user(db_session, username="me_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 调用 /me
        response = await client.get("/api/auth/me", headers=headers)

        # Then: 返回用户信息
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["username"] == "me_admin"
        assert data["role"] == "admin"
        assert "id" in data
        assert "password" not in data  # 密码不泄露

    @pytest.mark.asyncio
    async def test_me_returns_user_role(self, client, db_session):
        # Given: 已登录的普通用户
        user = await create_test_user(db_session, username="me_user", role="user")
        headers, _ = make_auth_headers(user)

        # When: 调用 /me
        response = await client.get("/api/auth/me", headers=headers)

        # Then: 返回正确的 role
        assert response.status_code == 200
        assert response.json()["data"]["role"] == "user"
