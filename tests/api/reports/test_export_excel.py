"""
test_export_excel — Excel 报告导出
Test ID: 5.4-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestExportExcel:
    """GET /api/projects/{pid}/plans/{planId}/export/excel"""

    async def _setup_completed_plan(self, client, db_session):
        admin = await create_test_user(db_session, username="excel_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/projects", headers=headers, json={"name": "excel-proj"})
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        case_ids = []
        for name in ["用例A", "用例B"]:
            cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
                "title": name, "type": "api", "module": "test", "priority": "P0", "steps": [{"action": "test"}],
            })
            case_ids.append(cr.json()["data"]["id"])

        pr = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "Excel 导出测试", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = pr.json()["data"]["id"]

        await client.post(f"/api/projects/{pid}/plans/{plan_id}/execute", headers=headers)
        results = await client.get(f"/api/projects/{pid}/plans/{plan_id}/results", headers=headers)
        scenarios = results.json()["data"]["scenarios"]
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/manual-record", headers=headers, json={
            "scenarioId": scenarios[0]["id"], "status": "passed",
        })
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/manual-record", headers=headers, json={
            "scenarioId": scenarios[1]["id"], "status": "failed", "remark": "bug",
        })
        await client.post(f"/api/projects/{pid}/plans/{plan_id}/complete", headers=headers)
        return headers, pid, plan_id

    @pytest.mark.asyncio
    async def test_export_excel_success(self, client, db_session):
        headers, pid, plan_id = await self._setup_completed_plan(client, db_session)

        response = await client.get(f"/api/projects/{pid}/plans/{plan_id}/export/excel", headers=headers)

        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")
        assert len(response.content) > 100  # 文件不为空

    @pytest.mark.asyncio
    async def test_export_no_report_returns_404(self, client, db_session):
        admin = await create_test_user(db_session, username="excel_nf", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={"name": "excel-nf-proj"})
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]
        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "x", "type": "api", "module": "x", "priority": "P0", "steps": [{"action": "x"}],
        })
        pr = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "未执行", "planType": "manual", "testType": "api", "caseIds": [cr.json()["data"]["id"]],
        })

        response = await client.get(f"/api/projects/{pid}/plans/{pr.json()['data']['id']}/export/excel", headers=headers)
        assert response.status_code == 404
