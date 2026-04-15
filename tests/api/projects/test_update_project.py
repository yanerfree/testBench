"""
test_update_project — admin 更新项目信息
Test ID: 1.4-API-004
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestUpdateProject:
    """PUT /api/projects/{id}：admin 更新项目"""

    @pytest.mark.asyncio
    async def test_update_git_url(self, client, db_session):
        # Given: admin 创建了项目
        admin = await create_test_user(db_session, username="upd_proj_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "upd-proj", "gitUrl": "git@old.com:r.git", "scriptBasePath": "/old",
        })
        project_id = r.json()["data"]["id"]

        # When: 更新 git_url
        response = await client.put(f"/api/projects/{project_id}", headers=headers, json={
            "gitUrl": "https://new-repo.com/r.git",
        })

        # Then: 返回 200，git_url 已更新
        assert response.status_code == 200
        assert response.json()["data"]["gitUrl"] == "https://new-repo.com/r.git"
