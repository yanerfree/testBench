"""
test_update_user_not_found — 更新不存在的用户返回 404
Test ID: 1.3-API-005
Priority: P1
"""
import uuid

import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestUpdateUserNotFound:
    """PUT /api/users/{id}：用户不存在时返回 404"""

    @pytest.mark.asyncio
    async def test_update_nonexistent_user_returns_404(self, client, db_session):
        # Given: admin 已登录，目标用户 ID 不存在
        admin = await create_test_user(db_session, username="upd_nf_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        fake_id = uuid.uuid4()

        # When: 尝试更新不存在的用户
        response = await client.put(f"/api/users/{fake_id}", headers=headers, json={
            "role": "admin",
        })

        # Then: 返回 404
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "USER_NOT_FOUND"
