"""
test_get_case — 用例详情
Test ID: 2.4-API-002
Priority: P0
"""
import uuid

import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestGetCase:
    """GET /api/projects/{pid}/branches/{bid}/cases/{caseId}"""

    async def _setup_with_case(self, client, db_session):
        admin = await create_test_user(db_session, username="get_case_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "get-case-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/gc",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "详情测试用例", "type": "api", "module": "auth",
            "priority": "P0", "steps": [{"action": "test"}],
        })
        case_id = cr.json()["data"]["id"]
        return headers, pid, bid, case_id

    @pytest.mark.asyncio
    async def test_get_case_success(self, client, db_session):
        headers, pid, bid, case_id = await self._setup_with_case(client, db_session)

        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases/{case_id}", headers=headers)

        assert response.status_code == 200
        data = response.json()["data"]
        assert data["id"] == case_id
        assert data["title"] == "详情测试用例"
        assert data["steps"] == [{"action": "test"}]

    @pytest.mark.asyncio
    async def test_get_nonexistent_case_returns_404(self, client, db_session):
        admin = await create_test_user(db_session, username="get_nf_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "get-nf-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/gnf",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases/{uuid.uuid4()}", headers=headers)
        assert response.status_code == 404
