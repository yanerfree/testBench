"""
test_list_branches — 分支配置列表
Test ID: 2.1-API-002
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestListBranches:
    """GET /api/projects/{id}/branches"""

    @pytest.mark.asyncio
    async def test_list_includes_default_branch(self, client, db_session):
        # Given: admin 创建了项目（自动生成 default 分支）
        admin = await create_test_user(db_session, username="br_list_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "br-list-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/bl",
        })
        project_id = r.json()["data"]["id"]

        # When: 查询分支列表
        response = await client.get(f"/api/projects/{project_id}/branches", headers=headers)

        # Then: 包含 default 分支
        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data) >= 1
        names = [b["name"] for b in data]
        assert "default" in names
