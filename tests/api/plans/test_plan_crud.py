"""
test_plan_crud — 测试计划 CRUD
Test ID: 4.1-API-001
Priority: P0
"""
import uuid

import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestPlanCRUD:
    """测试计划 CRUD 完整流程"""

    async def _setup(self, client, db_session):
        """辅助：创建 admin + 项目 + 分支 + 2 条用例"""
        admin = await create_test_user(db_session, username="plan_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/projects", headers=headers, json={
            "name": "plan-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/p",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        case_ids = []
        for i in range(2):
            cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
                "title": f"计划用例{i+1}", "type": "api", "module": "test",
                "priority": "P0", "steps": [{"action": "test"}],
            })
            case_ids.append(cr.json()["data"]["id"])

        return headers, pid, case_ids, admin

    @pytest.mark.asyncio
    async def test_create_plan(self, client, db_session):
        headers, pid, case_ids, admin = await self._setup(client, db_session)

        response = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "冒烟测试计划",
            "planType": "automated",
            "testType": "api",
            "caseIds": case_ids,
            "retryCount": 1,
        })

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["name"] == "冒烟测试计划"
        assert data["planType"] == "automated"
        assert data["status"] == "draft"

    @pytest.mark.asyncio
    async def test_list_plans(self, client, db_session):
        headers, pid, case_ids, _ = await self._setup(client, db_session)
        await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "列表测试", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })

        response = await client.get(f"/api/projects/{pid}/plans", headers=headers)

        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data) >= 1
        assert data[0]["caseCount"] == 2

    @pytest.mark.asyncio
    async def test_get_plan_detail(self, client, db_session):
        headers, pid, case_ids, _ = await self._setup(client, db_session)
        r = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "详情测试", "planType": "automated", "testType": "e2e", "caseIds": case_ids,
        })
        plan_id = r.json()["data"]["id"]

        response = await client.get(f"/api/projects/{pid}/plans/{plan_id}", headers=headers)

        assert response.status_code == 200
        assert response.json()["data"]["name"] == "详情测试"

    @pytest.mark.asyncio
    async def test_archive_plan(self, client, db_session):
        headers, pid, case_ids, _ = await self._setup(client, db_session)
        r = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "归档测试", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = r.json()["data"]["id"]

        response = await client.post(f"/api/projects/{pid}/plans/{plan_id}/archive", headers=headers)

        assert response.status_code == 200
        assert response.json()["data"]["status"] == "archived"

    @pytest.mark.asyncio
    async def test_delete_draft_plan(self, client, db_session):
        headers, pid, case_ids, _ = await self._setup(client, db_session)
        r = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "删除测试", "planType": "manual", "testType": "api", "caseIds": case_ids,
        })
        plan_id = r.json()["data"]["id"]

        response = await client.delete(f"/api/projects/{pid}/plans/{plan_id}", headers=headers)

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_create_plan_without_cases_returns_422(self, client, db_session):
        headers, pid, _, _ = await self._setup(client, db_session)

        response = await client.post(f"/api/projects/{pid}/plans", headers=headers, json={
            "name": "空计划", "planType": "manual", "testType": "api", "caseIds": [],
        })

        assert response.status_code == 422
