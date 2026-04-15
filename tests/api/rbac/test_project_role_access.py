"""
test_project_role_access — 项目级角色权限验证
Test ID: 1.6-API-001
Priority: P0
"""
import pytest

from app.models.project import ProjectMember
from tests.conftest import create_test_user, make_auth_headers


class TestProjectRoleAccess:
    """require_project_role：不同角色的访问控制"""

    async def _setup_project_with_members(self, client, db_session):
        """辅助方法：创建项目并绑定不同角色的用户"""
        admin = await create_test_user(db_session, username="rbac_admin", role="admin")
        admin_headers, _ = make_auth_headers(admin)

        # 创建项目
        r = await client.post("/api/projects", headers=admin_headers, json={
            "name": "rbac-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/rbac",
        })
        project_id = r.json()["data"]["id"]

        # 创建各角色用户并绑定到项目
        pa_user = await create_test_user(db_session, username="rbac_pa", role="user")
        dev_user = await create_test_user(db_session, username="rbac_dev", role="user")
        tester_user = await create_test_user(db_session, username="rbac_tester", role="user")
        guest_user = await create_test_user(db_session, username="rbac_guest", role="user")
        unbound_user = await create_test_user(db_session, username="rbac_unbound", role="user")

        for user, role in [
            (pa_user, "project_admin"),
            (dev_user, "developer"),
            (tester_user, "tester"),
            (guest_user, "guest"),
        ]:
            db_session.add(ProjectMember(project_id=project_id, user_id=user.id, role=role))
        await db_session.flush()

        return {
            "project_id": project_id,
            "admin": admin,
            "project_admin": pa_user,
            "developer": dev_user,
            "tester": tester_user,
            "guest": guest_user,
            "unbound": unbound_user,
        }

    @pytest.mark.asyncio
    async def test_admin_bypasses_project_role(self, client, db_session):
        # Given: 系统 admin（未绑定到项目也可以）
        ctx = await self._setup_project_with_members(client, db_session)
        headers, _ = make_auth_headers(ctx["admin"])

        # When: 访问成员列表
        response = await client.get(f"/api/projects/{ctx['project_id']}/members", headers=headers)

        # Then: 200 通过
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_project_admin_can_add_member(self, client, db_session):
        # Given: project_admin 用户
        ctx = await self._setup_project_with_members(client, db_session)
        new_user = await create_test_user(db_session, username="rbac_new", role="user")
        headers, _ = make_auth_headers(ctx["project_admin"])

        # When: 添加新成员
        response = await client.post(
            f"/api/projects/{ctx['project_id']}/members", headers=headers,
            json={"userId": str(new_user.id), "role": "tester"},
        )

        # Then: 201 成功
        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_developer_can_view_members(self, client, db_session):
        # Given: developer 用户
        ctx = await self._setup_project_with_members(client, db_session)
        headers, _ = make_auth_headers(ctx["developer"])

        # When: 查看成员列表（所有成员都可查看）
        response = await client.get(f"/api/projects/{ctx['project_id']}/members", headers=headers)

        # Then: 200
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_developer_cannot_add_member(self, client, db_session):
        # Given: developer 用户
        ctx = await self._setup_project_with_members(client, db_session)
        new_user = await create_test_user(db_session, username="rbac_blocked", role="user")
        headers, _ = make_auth_headers(ctx["developer"])

        # When: 尝试添加成员
        response = await client.post(
            f"/api/projects/{ctx['project_id']}/members", headers=headers,
            json={"userId": str(new_user.id), "role": "tester"},
        )

        # Then: 403
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "PROJECT_ROLE_DENIED"

    @pytest.mark.asyncio
    async def test_guest_cannot_add_member(self, client, db_session):
        # Given: guest 用户
        ctx = await self._setup_project_with_members(client, db_session)
        new_user = await create_test_user(db_session, username="rbac_blocked2", role="user")
        headers, _ = make_auth_headers(ctx["guest"])

        # When: 尝试添加成员
        response = await client.post(
            f"/api/projects/{ctx['project_id']}/members", headers=headers,
            json={"userId": str(new_user.id), "role": "tester"},
        )

        # Then: 403
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_unbound_user_rejected(self, client, db_session):
        # Given: 未绑定到项目的用户
        ctx = await self._setup_project_with_members(client, db_session)
        headers, _ = make_auth_headers(ctx["unbound"])

        # When: 尝试访问成员列表
        response = await client.get(f"/api/projects/{ctx['project_id']}/members", headers=headers)

        # Then: 403
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_PROJECT_MEMBER"
