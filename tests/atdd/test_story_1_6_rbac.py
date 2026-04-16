"""
ATDD 验收测试 — Story 1.6: RBAC 权限体系全局强制
TDD Red Phase: 验证两级角色体系的权限控制

覆盖验收标准:
- admin 可访问所有项目数据
- 非 admin 未绑定项目 → 403
- project_admin 可管理配置和成员
- developer/tester 可操作但不可改配置
- guest 写操作 → 403
- @require_role / @require_project_role 装饰器
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


async def _setup_project_with_roles(client, db_session):
    """辅助: 创建项目 + 各角色用户，返回所有上下文"""
    admin = await create_test_user(db_session, username="rbac_admin", role="admin")
    project_admin_user = await create_test_user(db_session, username="rbac_proj_admin", role="user")
    developer = await create_test_user(db_session, username="rbac_developer", role="user")
    tester = await create_test_user(db_session, username="rbac_tester", role="user")
    guest = await create_test_user(db_session, username="rbac_guest", role="user")
    unbound_user = await create_test_user(db_session, username="rbac_unbound", role="user")

    admin_headers, _ = make_auth_headers(admin)

    # 创建项目
    resp = await client.post("/api/projects", headers=admin_headers, json={
        "name": "rbac-test-project",
        "gitUrl": "git@x.com:rbac/test.git",
        "scriptBasePath": "/tmp/rbac",
    })
    project_id = resp.json()["data"]["id"]

    # 添加各角色成员
    for user, role in [
        (project_admin_user, "project_admin"),
        (developer, "developer"),
        (tester, "tester"),
        (guest, "guest"),
    ]:
        await client.post(f"/api/projects/{project_id}/members", headers=admin_headers, json={
            "userId": str(user.id),
            "role": role,
        })

    return {
        "project_id": project_id,
        "admin": (admin, make_auth_headers(admin)[0]),
        "project_admin": (project_admin_user, make_auth_headers(project_admin_user)[0]),
        "developer": (developer, make_auth_headers(developer)[0]),
        "tester": (tester, make_auth_headers(tester)[0]),
        "guest": (guest, make_auth_headers(guest)[0]),
        "unbound": (unbound_user, make_auth_headers(unbound_user)[0]),
    }


# ---------------------------------------------------------------------------
# 1.6-API-001: admin 可访问所有项目
# Priority: P0
# ---------------------------------------------------------------------------
class TestAdminAccessAll:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_admin_can_access_any_project(self, client, db_session):
        """AC: 系统管理员可访问所有项目所有数据"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, admin_headers = ctx["admin"]

        # When: admin 访问项目成员列表
        response = await client.get(
            f"/api/projects/{ctx['project_id']}/members",
            headers=admin_headers,
        )

        # Then: 成功
        assert response.status_code == 200

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_admin_sees_all_projects_in_list(self, client, db_session):
        """AC: admin 项目列表包含所有项目"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, admin_headers = ctx["admin"]

        response = await client.get("/api/projects", headers=admin_headers)
        assert response.status_code == 200
        names = [p["name"] for p in response.json()["data"]]
        assert "rbac-test-project" in names


# ---------------------------------------------------------------------------
# 1.6-API-002: 非 admin 未绑定项目 → 403
# Priority: P0
# ---------------------------------------------------------------------------
class TestUnboundUserDenied:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_unbound_user_cannot_access_project(self, client, db_session):
        """AC: 未绑定项目的用户访问该项目 API 返回 403"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, unbound_headers = ctx["unbound"]

        response = await client.get(
            f"/api/projects/{ctx['project_id']}/members",
            headers=unbound_headers,
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# 1.6-API-003: project_admin 可管理配置和成员
# Priority: P0
# ---------------------------------------------------------------------------
class TestProjectAdminPermissions:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_project_admin_can_manage_members(self, client, db_session):
        """AC: project_admin 可管理所属项目成员"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, pa_headers = ctx["project_admin"]
        new_user = await create_test_user(db_session, username="rbac_new_mem", role="user")

        # When: project_admin 添加成员
        response = await client.post(
            f"/api/projects/{ctx['project_id']}/members",
            headers=pa_headers,
            json={"userId": str(new_user.id), "role": "tester"},
        )

        assert response.status_code in (200, 201)

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_project_admin_can_update_project(self, client, db_session):
        """AC: project_admin 可管理所属项目配置"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, pa_headers = ctx["project_admin"]

        response = await client.put(
            f"/api/projects/{ctx['project_id']}",
            headers=pa_headers,
            json={"description": "updated by project admin"},
        )

        assert response.status_code == 200


# ---------------------------------------------------------------------------
# 1.6-API-004/005: developer/tester 权限边界
# Priority: P1
# ---------------------------------------------------------------------------
class TestDeveloperTesterPermissions:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_developer_cannot_modify_project_config(self, client, db_session):
        """AC: developer 不可改项目配置"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, dev_headers = ctx["developer"]

        response = await client.put(
            f"/api/projects/{ctx['project_id']}",
            headers=dev_headers,
            json={"description": "dev tried to update"},
        )

        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_tester_cannot_modify_project_config(self, client, db_session):
        """AC: tester 不可改项目配置"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, tester_headers = ctx["tester"]

        response = await client.put(
            f"/api/projects/{ctx['project_id']}",
            headers=tester_headers,
            json={"description": "tester tried to update"},
        )

        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_developer_cannot_manage_members(self, client, db_session):
        """AC: developer 不可管理成员"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, dev_headers = ctx["developer"]
        new_user = await create_test_user(db_session, username="rbac_dev_add", role="user")

        response = await client.post(
            f"/api/projects/{ctx['project_id']}/members",
            headers=dev_headers,
            json={"userId": str(new_user.id), "role": "tester"},
        )

        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_developer_can_read_project_data(self, client, db_session):
        """AC: developer 可查看项目数据"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, dev_headers = ctx["developer"]

        response = await client.get(
            f"/api/projects/{ctx['project_id']}/members",
            headers=dev_headers,
        )

        assert response.status_code == 200


# ---------------------------------------------------------------------------
# 1.6-API-006: guest 写操作 → 403
# Priority: P0
# ---------------------------------------------------------------------------
class TestGuestPermissions:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_guest_cannot_modify_project(self, client, db_session):
        """AC: guest 写操作返回 403"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, guest_headers = ctx["guest"]

        response = await client.put(
            f"/api/projects/{ctx['project_id']}",
            headers=guest_headers,
            json={"description": "guest tried"},
        )

        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_guest_cannot_add_member(self, client, db_session):
        """AC: guest 不能添加成员"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, guest_headers = ctx["guest"]
        new_user = await create_test_user(db_session, username="rbac_guest_add", role="user")

        response = await client.post(
            f"/api/projects/{ctx['project_id']}/members",
            headers=guest_headers,
            json={"userId": str(new_user.id), "role": "tester"},
        )

        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_guest_can_read_project_data(self, client, db_session):
        """AC: guest 可以查看数据"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, guest_headers = ctx["guest"]

        response = await client.get(
            f"/api/projects/{ctx['project_id']}/members",
            headers=guest_headers,
        )

        assert response.status_code == 200


# ---------------------------------------------------------------------------
# 1.6-API-007/008: 装饰器验证
# Priority: P0
# ---------------------------------------------------------------------------
class TestRoleDecorators:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_require_role_blocks_non_admin(self, client, db_session):
        """AC: @require_role 装饰器正确拦截系统级权限"""
        user = await create_test_user(db_session, username="deco_user", role="user")
        headers, _ = make_auth_headers(user)

        # 用户管理需要 admin 角色
        response = await client.get("/api/users", headers=headers)
        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_require_role_allows_admin(self, client, db_session):
        """AC: @require_role 允许 admin 通过"""
        admin = await create_test_user(db_session, username="deco_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        response = await client.get("/api/users", headers=headers)
        assert response.status_code == 200

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_require_project_role_blocks_unbound(self, client, db_session):
        """AC: @require_project_role 装饰器正确拦截项目级权限"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, unbound_headers = ctx["unbound"]

        response = await client.get(
            f"/api/projects/{ctx['project_id']}/members",
            headers=unbound_headers,
        )
        assert response.status_code == 403

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_require_project_role_allows_member(self, client, db_session):
        """AC: @require_project_role 允许项目成员通过"""
        ctx = await _setup_project_with_roles(client, db_session)
        _, tester_headers = ctx["tester"]

        response = await client.get(
            f"/api/projects/{ctx['project_id']}/members",
            headers=tester_headers,
        )
        assert response.status_code == 200
