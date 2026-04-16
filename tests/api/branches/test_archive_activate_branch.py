"""
test_archive_activate_branch — 归档/恢复分支 + 最后活跃分支保护
Test ID: 2.1-API-003
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestArchiveActivateBranch:
    """归档/恢复分支配置"""

    async def _create_project_with_extra_branch(self, client, headers):
        """辅助：创建项目 + 额外分支，返回 (project_id, default_branch_id, extra_branch_id)"""
        r = await client.post("/api/projects", headers=headers, json={
            "name": "arc-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/arc",
        })
        project_id = r.json()["data"]["id"]

        # 查询 default 分支 id
        br_list = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        default_id = br_list.json()["data"][0]["id"]

        # 创建额外分支
        r2 = await client.post(f"/api/projects/{project_id}/branches", headers=headers, json={
            "name": "feature-x", "branch": "feature/x",
        })
        extra_id = r2.json()["data"]["id"]

        return project_id, default_id, extra_id

    @pytest.mark.asyncio
    async def test_archive_branch_success(self, client, db_session):
        # Given: 项目有 2 个活跃分支
        admin = await create_test_user(db_session, username="arc_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        project_id, default_id, extra_id = await self._create_project_with_extra_branch(client, headers)

        # When: 归档 extra 分支
        response = await client.post(
            f"/api/projects/{project_id}/branches/{extra_id}/archive", headers=headers
        )

        # Then: 200，status 变为 archived
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "archived"

    @pytest.mark.asyncio
    async def test_cannot_archive_last_active_branch(self, client, db_session):
        # Given: 项目只有 1 个活跃分支（default）
        admin = await create_test_user(db_session, username="arc_last_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "arc-last-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/al",
        })
        project_id = r.json()["data"]["id"]
        br_list = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        default_id = br_list.json()["data"][0]["id"]

        # When: 尝试归档唯一的活跃分支
        response = await client.post(
            f"/api/projects/{project_id}/branches/{default_id}/archive", headers=headers
        )

        # Then: 422
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "LAST_ACTIVE_BRANCH"

    @pytest.mark.asyncio
    async def test_activate_archived_branch(self, client, db_session):
        # Given: 一个已归档的分支
        admin = await create_test_user(db_session, username="act_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        project_id, default_id, extra_id = await self._create_project_with_extra_branch(client, headers)
        await client.post(f"/api/projects/{project_id}/branches/{extra_id}/archive", headers=headers)

        # When: 恢复该分支
        response = await client.post(
            f"/api/projects/{project_id}/branches/{extra_id}/activate", headers=headers
        )

        # Then: 200，status 变为 active
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "active"
