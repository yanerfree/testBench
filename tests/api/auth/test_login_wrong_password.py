"""
test_login_wrong_password — 错误密码登录返回 401
Test ID: 1.2-API-002
Priority: P0
"""
import pytest

from tests.conftest import create_test_user


class TestLoginWrongPassword:
    """登录失败：密码错误返回统一错误信息，不泄露具体原因"""

    @pytest.mark.asyncio
    async def test_wrong_password_returns_401(self, client, db_session):
        # Given: 数据库中存在用户
        await create_test_user(db_session, username="wrongpwduser")

        # When: 使用错误密码登录
        response = await client.post("/api/auth/login", json={
            "username": "wrongpwduser",
            "password": "wrong-password",
        })

        # Then: 返回 401，错误信息不泄露具体字段
        assert response.status_code == 401
        error = response.json()["error"]
        assert error["code"] == "LOGIN_FAILED"
        assert "用户名或密码错误" in error["message"]

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_401(self, client):
        # Given: 一个不存在的用户名
        # When: 登录
        response = await client.post("/api/auth/login", json={
            "username": "no_such_user",
            "password": "any-password",
        })

        # Then: 返回 401，错误信息与密码错误一致（不泄露用户是否存在）
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "LOGIN_FAILED"
