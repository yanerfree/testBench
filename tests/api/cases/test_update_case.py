"""
test_update_case — 更新用例
Test ID: 2.4-API-003
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestUpdateCase:
    """PUT /api/projects/{pid}/branches/{bid}/cases/{caseId}"""

    async def _setup_with_case(self, client, db_session):
        admin = await create_test_user(db_session, username="upd_case_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "upd-case-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/uc",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "原始标题", "type": "api", "module": "users",
            "priority": "P2", "steps": [{"action": "old step"}],
        })
        case_id = cr.json()["data"]["id"]
        return headers, pid, bid, case_id

    @pytest.mark.asyncio
    async def test_update_title_and_priority(self, client, db_session):
        headers, pid, bid, case_id = await self._setup_with_case(client, db_session)

        response = await client.put(f"/api/projects/{pid}/branches/{bid}/cases/{case_id}", headers=headers, json={
            "title": "新标题V2",
            "priority": "P0",
        })

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["title"] == "新标题V2"
        assert data["priority"] == "P0"

    @pytest.mark.asyncio
    async def test_update_flaky_flag(self, client, db_session):
        headers, pid, bid, case_id = await self._setup_with_case(client, db_session)

        response = await client.put(f"/api/projects/{pid}/branches/{bid}/cases/{case_id}", headers=headers, json={
            "isFlaky": True,
        })

        assert response.status_code == 200
        assert response.json()["data"]["isFlaky"] is True

    @pytest.mark.asyncio
    async def test_update_steps(self, client, db_session):
        headers, pid, bid, case_id = await self._setup_with_case(client, db_session)

        new_steps = [{"action": "step 1"}, {"action": "step 2", "expected": "ok"}]
        response = await client.put(f"/api/projects/{pid}/branches/{bid}/cases/{case_id}", headers=headers, json={
            "steps": new_steps,
        })

        assert response.status_code == 200
        assert len(response.json()["data"]["steps"]) == 2
