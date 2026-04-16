"""
test_delete_case — 用例软删除
Test ID: 2.8-API-001
Priority: P0
"""
import uuid

import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestDeleteCase:
    """DELETE /api/projects/{pid}/branches/{bid}/cases/{caseId}"""

    async def _setup_with_case(self, client, db_session):
        admin = await create_test_user(db_session, username="del_case_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "del-case-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/dc",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "待删除用例", "type": "api", "module": "test",
            "priority": "P0", "steps": [{"action": "test"}],
        })
        case_id = cr.json()["data"]["id"]
        return headers, pid, bid, case_id

    @pytest.mark.asyncio
    async def test_soft_delete_success(self, client, db_session):
        headers, pid, bid, case_id = await self._setup_with_case(client, db_session)

        # When: 删除
        response = await client.delete(f"/api/projects/{pid}/branches/{bid}/cases/{case_id}", headers=headers)

        # Then: 200
        assert response.status_code == 200
        assert response.json()["message"] == "删除成功"

        # Then: 列表中不再显示
        list_r = await client.get(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers)
        ids = [c["id"] for c in list_r.json()["data"]]
        assert case_id not in ids

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_404(self, client, db_session):
        admin = await create_test_user(db_session, username="del_nf_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "del-nf-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/dnf",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        response = await client.delete(f"/api/projects/{pid}/branches/{bid}/cases/{uuid.uuid4()}", headers=headers)
        assert response.status_code == 404
