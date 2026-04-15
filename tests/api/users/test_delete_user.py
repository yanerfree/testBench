"""
test_delete_user — admin 删除用户
Test ID: 1.3-API-006
Priority: P1
"""
import uuid

import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestDeleteUser:
    """DELETE /api/users/{id}：admin 删除用户"""

    @pytest.mark.asyncio
    async def test_delete_user_success(self, client, db_session):
        # Given: admin 和一个待删除的用户
        admin = await create_test_user(db_session, username="del_admin", role="admin")
        target = await create_test_user(db_session, username="del_target", role="user")
        headers, _ = make_auth_headers(admin)

        # When: 删除该用户
        response = await client.delete(f"/api/users/{target.id}", headers=headers)

        # Then: 返回 200 和成功消息
        assert response.status_code == 200
        assert response.json()["message"] == "删除成功"

    @pytest.mark.asyncio
    async def test_delete_nonexistent_user_returns_404(self, client, db_session):
        # Given: admin 已登录，目标 ID 不存在
        admin = await create_test_user(db_session, username="del_nf_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 删除不存在的用户
        response = await client.delete(f"/api/users/{uuid.uuid4()}", headers=headers)

        # Then: 返回 404
        assert response.status_code == 404
