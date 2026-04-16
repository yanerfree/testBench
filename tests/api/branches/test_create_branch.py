"""
test_create_branch — 创建分支配置
Test ID: 2.1-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestCreateBranch:
    """POST /api/projects/{id}/branches"""

    @pytest.mark.asyncio
    async def test_create_branch_success(self, client, db_session):
        # Given: admin 创建了项目
        admin = await create_test_user(db_session, username="br_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "br-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/br",
        })
        project_id = r.json()["data"]["id"]

        # When: 创建新分支配置
        response = await client.post(f"/api/projects/{project_id}/branches", headers=headers, json={
            "name": "release-v2",
            "branch": "release/2.0",
        })

        # Then: 201
        assert response.status_code == 201
        data = response.json()["data"]
        assert data["name"] == "release-v2"
        assert data["branch"] == "release/2.0"
        assert data["status"] == "active"

    @pytest.mark.asyncio
    async def test_duplicate_name_returns_409(self, client, db_session):
        # Given: 项目已有 default 分支
        admin = await create_test_user(db_session, username="br_dup_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "br-dup-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/brd",
        })
        project_id = r.json()["data"]["id"]

        # When: 创建同名分支（default 已存在）
        response = await client.post(f"/api/projects/{project_id}/branches", headers=headers, json={
            "name": "default",
        })

        # Then: 409
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "BRANCH_NAME_EXISTS"
