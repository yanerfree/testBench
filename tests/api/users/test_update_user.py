"""
test_update_user — admin 更新用户角色/状态
Test ID: 1.3-API-004
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestUpdateUser:
    """PUT /api/users/{id}：admin 更新用户信息"""

    @pytest.mark.asyncio
    async def test_update_role(self, client, db_session):
        # Given: admin 和一个普通用户
        admin = await create_test_user(db_session, username="upd_admin", role="admin")
        target = await create_test_user(db_session, username="upd_target", role="user")
        headers, _ = make_auth_headers(admin)

        # When: 将用户角色改为 admin
        response = await client.put(f"/api/users/{target.id}", headers=headers, json={
            "role": "admin",
        })

        # Then: 返回 200，role 已更新
        assert response.status_code == 200
        assert response.json()["data"]["role"] == "admin"

    @pytest.mark.asyncio
    async def test_update_is_active(self, client, db_session):
        # Given: admin 和一个活跃用户
        admin = await create_test_user(db_session, username="upd_admin2", role="admin")
        target = await create_test_user(db_session, username="upd_target2", role="user")
        headers, _ = make_auth_headers(admin)

        # When: 禁用该用户
        response = await client.put(f"/api/users/{target.id}", headers=headers, json={
            "isActive": False,
        })

        # Then: 返回 200，is_active 为 false
        assert response.status_code == 200
        assert response.json()["data"]["isActive"] is False
