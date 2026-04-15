"""
test_list_users — admin 查询用户列表
Test ID: 1.3-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestListUsers:
    """GET /api/users：admin 获取所有用户列表"""

    @pytest.mark.asyncio
    async def test_admin_can_list_users(self, client, db_session):
        # Given: 数据库中有两个用户
        admin = await create_test_user(db_session, username="list_admin", role="admin")
        await create_test_user(db_session, username="list_user", role="user")
        headers, _ = make_auth_headers(admin)

        # When: admin 请求用户列表
        response = await client.get("/api/users", headers=headers)

        # Then: 返回 200 和用户数组
        assert response.status_code == 200
        data = response.json()["data"]
        assert isinstance(data, list)
        assert len(data) >= 2
        usernames = [u["username"] for u in data]
        assert "list_admin" in usernames
        assert "list_user" in usernames
        # 密码不泄露
        for u in data:
            assert "password" not in u
