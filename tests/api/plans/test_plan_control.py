"""
test_plan_pause_resume_abort — Story 4.5/4.6
暂停/恢复/终止 + 处理人分配
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestPauseResumeAbort:

    async def _setup_executing(self, client, db_session):
        """创建项目 + 用例 + 计划 → 执行 → 返回 executing 状态"""
        admin = await create_test_user(db_session, username="ctrl_admin", role="admin")
        h, _ = make_auth_headers(admin)

        r = await client.post("/api/projects", headers=h, json={
            "name": "ctrl-proj", "gitUrl": "git@x.com:c.git", "scriptBasePath": "/c",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=h)
        bid = br.json()["data"][0]["id"]

        case_ids = []
        for i in range(3):
            cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=h, json={
                "title": f"ctrl-case-{i}", "type": "api", "module": "T",
                "priority": "P0", "steps": [{"action": "t"}],
            })
            case_ids.append(cr.json()["data"]["id"])

        r = await client.post(f"/api/projects/{pid}/plans", headers=h, json={
            "name": "ctrl-plan", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = r.json()["data"]["id"]

        await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=h)
        return h, pid, plan_id

    @pytest.mark.asyncio
    async def test_pause_executing_plan(self, client, db_session):
        """暂停执行中的计划"""
        h, pid, plan_id = await self._setup_executing(client, db_session)

        resp = await client.post(f"/api/projects/{pid}/plans/{plan_id}/pause", headers=h)
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "paused"

    @pytest.mark.asyncio
    async def test_resume_paused_plan(self, client, db_session):
        """恢复已暂停的计划"""
        h, pid, plan_id = await self._setup_executing(client, db_session)

        await client.post(f"/api/projects/{pid}/plans/{plan_id}/pause", headers=h)
        resp = await client.post(f"/api/projects/{pid}/plans/{plan_id}/resume", headers=h)
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "executing"

    @pytest.mark.asyncio
    async def test_resume_non_paused_returns_422(self, client, db_session):
        """非暂停状态不能恢复"""
        h, pid, plan_id = await self._setup_executing(client, db_session)

        resp = await client.post(f"/api/projects/{pid}/plans/{plan_id}/resume", headers=h)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_abort_executing_plan(self, client, db_session):
        """终止执行中的计划"""
        h, pid, plan_id = await self._setup_executing(client, db_session)

        resp = await client.post(f"/api/projects/{pid}/plans/{plan_id}/abort", headers=h)
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_abort_paused_plan(self, client, db_session):
        """终止已暂停的计划"""
        h, pid, plan_id = await self._setup_executing(client, db_session)

        await client.post(f"/api/projects/{pid}/plans/{plan_id}/pause", headers=h)
        resp = await client.post(f"/api/projects/{pid}/plans/{plan_id}/abort", headers=h)
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_abort_draft_returns_422(self, client, db_session):
        """草稿状态不能终止"""
        admin = await create_test_user(db_session, username="ctrl_admin2", role="admin")
        h, _ = make_auth_headers(admin)

        r = await client.post("/api/projects", headers=h, json={
            "name": "ctrl-proj2", "gitUrl": "git@x.com:c2.git", "scriptBasePath": "/c2",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=h)
        bid = br.json()["data"][0]["id"]

        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=h, json={
            "title": "c", "type": "api", "module": "T", "priority": "P0", "steps": [{"action": "t"}],
        })
        r = await client.post(f"/api/projects/{pid}/plans", headers=h, json={
            "name": "draft-plan", "planType": "manual", "testType": "api",
            "caseIds": [cr.json()["data"]["id"]],
        })

        resp = await client.post(f"/api/projects/{pid}/plans/{r.json()['data']['id']}/abort", headers=h)
        assert resp.status_code == 422


class TestAssignScenarios:

    @pytest.mark.asyncio
    async def test_assign_handler(self, client, db_session):
        """分配处理人"""
        admin = await create_test_user(db_session, username="assign_admin", role="admin")
        tester = await create_test_user(db_session, username="assign_tester", role="user")
        h, _ = make_auth_headers(admin)

        r = await client.post("/api/projects", headers=h, json={
            "name": "assign-proj", "gitUrl": "git@x.com:a.git", "scriptBasePath": "/a",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=h)
        bid = br.json()["data"][0]["id"]

        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=h, json={
            "title": "assign-case", "type": "api", "module": "T",
            "priority": "P0", "steps": [{"action": "t"}],
        })
        r = await client.post(f"/api/projects/{pid}/plans", headers=h, json={
            "name": "assign-plan", "planType": "manual", "testType": "api",
            "caseIds": [cr.json()["data"]["id"]],
        })
        plan_id = r.json()["data"]["id"]

        await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=h)

        results = await client.get(f"/api/projects/{pid}/plans/{plan_id}/results", headers=h)
        scenario_id = results.json()["data"]["scenarios"][0]["id"]

        resp = await client.put(f"/api/projects/{pid}/plans/{plan_id}/assign", headers=h, json={
            "scenarioIds": [scenario_id],
            "assigneeId": str(tester.id),
        })
        assert resp.status_code == 200
