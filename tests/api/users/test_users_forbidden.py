"""
test_users_forbidden — 非 admin 用户访问用户管理 API 返回 403
Test ID: 1.3-API-007
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestUsersForbidden:
    """用户管理 API 权限拦截：非 admin 返回 403"""

    @pytest.mark.asyncio
    async def test_regular_user_cannot_list_users(self, client, db_session):
        # Given: 一个普通 user 角色的用户
        user = await create_test_user(db_session, username="regular_user", role="user")
        headers, _ = make_auth_headers(user)

        # When: 尝试访问用户列表
        response = await client.get("/api/users", headers=headers)

        # Then: 返回 403
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "ROLE_DENIED"

    @pytest.mark.asyncio
    async def test_regular_user_cannot_create_user(self, client, db_session):
        # Given: 普通用户
        user = await create_test_user(db_session, username="regular_user2", role="user")
        headers, _ = make_auth_headers(user)

        # When: 尝试创建用户
        response = await client.post("/api/users", headers=headers, json={
            "username": "hacker_user",
            "password": "Pass123456",
        })

        # Then: 返回 403
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        # Given: 不携带 token
        # When: 访问用户列表
        response = await client.get("/api/users")

        # Then: 返回 401
        assert response.status_code == 401
