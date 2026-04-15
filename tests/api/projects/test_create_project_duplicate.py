"""
test_create_project_duplicate — 项目名称重复返回 409
Test ID: 1.4-API-002
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestCreateProjectDuplicate:
    """POST /api/projects：项目名重复时返回 409"""

    @pytest.mark.asyncio
    async def test_duplicate_name_returns_409(self, client, db_session):
        # Given: admin 已创建一个项目
        admin = await create_test_user(db_session, username="dup_proj_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        await client.post("/api/projects", headers=headers, json={
            "name": "dup-project",
            "gitUrl": "git@github.com:t/r.git",
            "scriptBasePath": "/opt/s/dup",
        })

        # When: 再次创建同名项目
        response = await client.post("/api/projects", headers=headers, json={
            "name": "dup-project",
            "gitUrl": "git@github.com:t/r2.git",
            "scriptBasePath": "/opt/s/dup2",
        })

        # Then: 返回 409
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "PROJECT_NAME_EXISTS"
