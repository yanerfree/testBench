"""
test_login_inactive_user — 禁用用户登录返回 401
Test ID: 1.2-API-003
Priority: P1
"""
import pytest

from tests.conftest import TEST_PASSWORD, create_test_user


class TestLoginInactiveUser:
    """禁用用户登录：is_active=False 的用户无法登录"""

    @pytest.mark.asyncio
    async def test_inactive_user_cannot_login(self, client, db_session):
        # Given: 数据库中存在一个被禁用的用户
        await create_test_user(db_session, username="disabled_user", is_active=False)

        # When: 用正确密码登录
        response = await client.post("/api/auth/login", json={
            "username": "disabled_user",
            "password": TEST_PASSWORD,
        })

        # Then: 返回 401，与密码错误同样的错误信息
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "LOGIN_FAILED"
