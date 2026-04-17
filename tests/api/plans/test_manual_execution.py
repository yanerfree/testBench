"""
test_manual_execution — 手动计划执行完整流程
Test ID: 4.4-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestManualExecution:
    """手动计划执行：启动 → 录入结果 → 确认完成"""

    async def _setup_plan(self, client, db_session):
        """辅助：创建项目 + 用例 + 手动计划"""
        admin = await create_test_user(db_session, username="exec_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # 创建项目
        r = await client.post("/api/projects", headers=headers, json={"name": "exec-proj"})
        pid = r.json()["data"]["id"]

        # 创建用例
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]
        case_ids = []
        for i in range(3):
            cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
                "title": f"手动用例{i+1}", "type": "api", "module": "test",
                "priority": "P0", "steps": [{"action": f"step{i+1}"}],
            })
            case_ids.append(cr.json()["data"]["id"])

        # 创建手动计划
        pr = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "手动回归", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = pr.json()["data"]["id"]

        return headers, pid, plan_id, case_ids

    @pytest.mark.asyncio
    async def test_execute_creates_report(self, client, db_session):
        headers, pid, plan_id, _ = await self._setup_plan(client, db_session)

        # When: 启动执行
        response = await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=headers)

        # Then: 200，报告已创建
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["totalScenarios"] == 3
        assert data["manualCount"] == 3

    @pytest.mark.asyncio
    async def test_manual_record_and_complete(self, client, db_session):
        headers, pid, plan_id, _ = await self._setup_plan(client, db_session)

        # 启动执行
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=headers)

        # 获取 scenarios
        results = await client.get(f"/api/projects/{pid}/plans/{plan_id}/results", headers=headers)
        scenarios = results.json()["data"]["scenarios"]
        assert len(scenarios) == 3
        assert all(s["status"] == "pending" for s in scenarios)

        # 录入结果：2 passed + 1 failed
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/manual-record", headers=headers, json={
            "scenarioId": scenarios[0]["id"], "status": "passed",
        })
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/manual-record", headers=headers, json={
            "scenarioId": scenarios[1]["id"], "status": "passed", "remark": "正常",
        })
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/manual-record", headers=headers, json={
            "scenarioId": scenarios[2]["id"], "status": "failed", "remark": "页面报错",
        })

        # 确认完成
        complete_r = await client.post(f"/api/projects/{pid}/plans/{plan_id}/complete", headers=headers)
        assert complete_r.status_code == 200
        assert complete_r.json()["data"]["status"] == "completed"

        # 验证报告汇总
        final = await client.get(f"/api/projects/{pid}/plans/{plan_id}/results", headers=headers)
        report = final.json()["data"]["report"]
        assert report["passed"] == 2
        assert report["failed"] == 1
        assert report["passRate"] is not None

    @pytest.mark.asyncio
    async def test_cannot_execute_non_draft_plan(self, client, db_session):
        headers, pid, plan_id, _ = await self._setup_plan(client, db_session)

        # 先执行一次
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=headers)

        # 再次执行应该失败
        response = await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=headers)
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_results_before_execution_returns_null(self, client, db_session):
        headers, pid, plan_id, _ = await self._setup_plan(client, db_session)

        response = await client.get(f"/api/projects/{pid}/plans/{plan_id}/results", headers=headers)
        assert response.status_code == 200
        assert response.json()["data"] is None
