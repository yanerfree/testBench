"""
test_plan_permissions — 测试计划权限和边界测试
覆盖: guest 不能创建/归档/删除、非成员 403、计划不存在 404
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestPlanPermissions:

    async def _setup(self, client, db_session):
        admin = await create_test_user(db_session, username="perm_plan_admin", role="admin")
        guest = await create_test_user(db_session, username="perm_plan_guest", role="user")
        admin_headers, _ = make_auth_headers(admin)
        guest_headers, _ = make_auth_headers(guest)

        r = await client.post("/api/projects", headers=admin_headers, json={
            "name": "perm-plan-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/p",
        })
        pid = r.json()["data"]["id"]

        await client.post(f"/api/projects/{pid}/members", headers=admin_headers, json={
            "userId": str(guest.id), "role": "guest",
        })

        br = await client.get(f"/api/projects/{pid}/branches", headers=admin_headers)
        bid = br.json()["data"][0]["id"]

        case_ids = []
        for i in range(2):
            cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=admin_headers, json={
                "title": f"perm-case-{i}", "type": "api", "module": "test",
                "priority": "P0", "steps": [{"action": "test"}],
            })
            case_ids.append(cr.json()["data"]["id"])

        return admin_headers, guest_headers, pid, case_ids

    @pytest.mark.asyncio
    async def test_guest_cannot_create_plan(self, client, db_session):
        """guest 不能创建计划"""
        admin_headers, guest_headers, pid, case_ids = await self._setup(client, db_session)

        response = await client.post(f"/api/projects/{pid}/plans", headers=guest_headers, json={
            "name": "guest plan", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_guest_can_list_plans(self, client, db_session):
        """guest 可以查看计划列表"""
        admin_headers, guest_headers, pid, case_ids = await self._setup(client, db_session)

        await client.post(f"/api/projects/{pid}/plans", headers=admin_headers, json={
            "name": "visible plan", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })

        response = await client.get(f"/api/projects/{pid}/plans", headers=guest_headers)
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_guest_cannot_archive_plan(self, client, db_session):
        """guest 不能归档计划"""
        admin_headers, guest_headers, pid, case_ids = await self._setup(client, db_session)

        r = await client.post(f"/api/projects/{pid}/plans", headers=admin_headers, json={
            "name": "archive target", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = r.json()["data"]["id"]

        response = await client.post(f"/api/projects/{pid}/plans/{plan_id}/archive", headers=guest_headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_guest_cannot_delete_plan(self, client, db_session):
        """guest 不能删除计划"""
        admin_headers, guest_headers, pid, case_ids = await self._setup(client, db_session)

        r = await client.post(f"/api/projects/{pid}/plans", headers=admin_headers, json={
            "name": "delete target", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = r.json()["data"]["id"]

        response = await client.delete(f"/api/projects/{pid}/plans/{plan_id}", headers=guest_headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_get_nonexistent_plan_returns_404(self, client, db_session):
        """不存在的计划返回 404"""
        admin_headers, _, pid, _ = await self._setup(client, db_session)

        response = await client.get(
            f"/api/projects/{pid}/plans/00000000-0000-0000-0000-000000000000",
            headers=admin_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_unbound_user_cannot_list_plans(self, client, db_session):
        """未绑定用户不能查看计划"""
        admin_headers, _, pid, _ = await self._setup(client, db_session)

        unbound = await create_test_user(db_session, username="unbound_plan", role="user")
        unbound_headers, _ = make_auth_headers(unbound)

        response = await client.get(f"/api/projects/{pid}/plans", headers=unbound_headers)
        assert response.status_code == 403
