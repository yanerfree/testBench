"""
test_logout — 登出接口返回成功确认
Test ID: 1.2-API-006
Priority: P1
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestLogout:
    """POST /api/auth/logout：已登录用户登出返回确认消息"""

    @pytest.mark.asyncio
    async def test_logout_returns_success(self, client, db_session):
        # Given: 已登录的用户
        admin = await create_test_user(db_session, username="logout_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 调用登出
        response = await client.post("/api/auth/logout", headers=headers)

        # Then: 返回成功消息
        assert response.status_code == 200
        assert response.json()["message"] == "登出成功"

    @pytest.mark.asyncio
    async def test_logout_without_token_returns_401(self, client):
        # Given: 未携带 token
        # When: 调用登出
        response = await client.post("/api/auth/logout")

        # Then: 返回 401
        assert response.status_code == 401
