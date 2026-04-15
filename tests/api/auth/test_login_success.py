"""
test_login_success — 正确凭据登录返回 JWT token
Test ID: 1.2-API-001
Priority: P0
"""
import pytest

from tests.conftest import TEST_PASSWORD, create_test_user


class TestLoginSuccess:
    """登录成功：正确用户名密码返回 token 和用户信息"""

    @pytest.mark.asyncio
    async def test_correct_credentials_return_token(self, client, db_session):
        # Given: 数据库中存在一个活跃用户
        user = await create_test_user(db_session, username="loginuser", role="user")

        # When: 用正确凭据登录
        response = await client.post("/api/auth/login", json={
            "username": "loginuser",
            "password": TEST_PASSWORD,
        })

        # Then: 返回 200 和 token
        assert response.status_code == 200
        data = response.json()["data"]
        assert "token" in data
        assert len(data["token"]) > 0
        assert data["user"]["username"] == "loginuser"
        assert data["user"]["role"] == "user"
        assert "password" not in data["user"]  # 密码不泄露

    @pytest.mark.asyncio
    async def test_admin_login_returns_admin_role(self, client, db_session):
        # Given: 一个 admin 用户
        await create_test_user(db_session, username="adminlogin", role="admin")

        # When: admin 登录
        response = await client.post("/api/auth/login", json={
            "username": "adminlogin",
            "password": TEST_PASSWORD,
        })

        # Then: 返回的 role 是 admin
        assert response.status_code == 200
        assert response.json()["data"]["user"]["role"] == "admin"
