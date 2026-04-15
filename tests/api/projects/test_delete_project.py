"""
test_delete_project — admin 删除项目（CASCADE）
Test ID: 1.4-API-005
Priority: P1
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.project import Branch, ProjectMember
from tests.conftest import create_test_user, make_auth_headers


class TestDeleteProject:
    """DELETE /api/projects/{id}：删除项目及关联数据"""

    @pytest.mark.asyncio
    async def test_delete_project_success(self, client, db_session):
        # Given: admin 创建了项目
        admin = await create_test_user(db_session, username="del_proj_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "del-proj", "gitUrl": "git@x.com:d.git", "scriptBasePath": "/d",
        })
        project_id = r.json()["data"]["id"]

        # When: 删除项目
        response = await client.delete(f"/api/projects/{project_id}", headers=headers)

        # Then: 返回成功
        assert response.status_code == 200
        assert response.json()["message"] == "删除成功"

        # Then: branches 和 members 也被 CASCADE 删除
        branches = (await db_session.execute(
            select(Branch).where(Branch.project_id == project_id)
        )).scalars().all()
        assert len(branches) == 0

        members = (await db_session.execute(
            select(ProjectMember).where(ProjectMember.project_id == project_id)
        )).scalars().all()
        assert len(members) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_404(self, client, db_session):
        # Given: admin 已登录
        admin = await create_test_user(db_session, username="del_nf_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 删除不存在的项目
        response = await client.delete(f"/api/projects/{uuid.uuid4()}", headers=headers)

        # Then: 404
        assert response.status_code == 404
