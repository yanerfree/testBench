"""
test_batch_cases — 用例批量操作
Test ID: 2.7-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestBatchCases:
    """POST /api/projects/{pid}/branches/{bid}/cases/batch"""

    async def _setup_with_cases(self, client, db_session):
        """辅助：创建项目 + 3 条用例，返回 (headers, pid, bid, [case_id1, case_id2, case_id3])"""
        admin = await create_test_user(db_session, username="batch_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "batch-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/b",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        ids = []
        for i in range(3):
            cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
                "title": f"批量用例{i+1}", "type": "api", "module": "batch",
                "priority": "P2", "steps": [{"action": "test"}],
            })
            ids.append(cr.json()["data"]["id"])
        return headers, pid, bid, ids

    @pytest.mark.asyncio
    async def test_batch_set_priority(self, client, db_session):
        headers, pid, bid, ids = await self._setup_with_cases(client, db_session)

        # When: 批量修改优先级为 P0
        response = await client.post(f"/api/projects/{pid}/branches/{bid}/cases/batch", headers=headers, json={
            "action": "set_priority",
            "caseIds": ids,
            "priority": "P0",
        })

        # Then: 3 个成功
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["succeeded"] == 3
        assert data["failed"] == 0

        # 验证数据库
        for cid in ids:
            r = await client.get(f"/api/projects/{pid}/branches/{bid}/cases/{cid}", headers=headers)
            assert r.json()["data"]["priority"] == "P0"

    @pytest.mark.asyncio
    async def test_batch_set_flaky(self, client, db_session):
        headers, pid, bid, ids = await self._setup_with_cases(client, db_session)

        # When: 批量标记 Flaky
        response = await client.post(f"/api/projects/{pid}/branches/{bid}/cases/batch", headers=headers, json={
            "action": "set_flaky",
            "caseIds": ids[:2],  # 只标记前 2 条
        })

        assert response.status_code == 200
        assert response.json()["data"]["succeeded"] == 2

    @pytest.mark.asyncio
    async def test_batch_archive_and_unarchive(self, client, db_session):
        headers, pid, bid, ids = await self._setup_with_cases(client, db_session)

        # When: 批量归档
        response = await client.post(f"/api/projects/{pid}/branches/{bid}/cases/batch", headers=headers, json={
            "action": "archive",
            "caseIds": ids,
        })
        assert response.json()["data"]["succeeded"] == 3

        # Then: 对已归档用例执行其他操作会被跳过
        response2 = await client.post(f"/api/projects/{pid}/branches/{bid}/cases/batch", headers=headers, json={
            "action": "set_priority",
            "caseIds": ids,
            "priority": "P0",
        })
        data2 = response2.json()["data"]
        assert data2["failed"] == 3
        assert all("已归档" in e for e in data2["errors"])

        # When: 批量取消归档
        response3 = await client.post(f"/api/projects/{pid}/branches/{bid}/cases/batch", headers=headers, json={
            "action": "unarchive",
            "caseIds": ids,
        })
        assert response3.json()["data"]["succeeded"] == 3

    @pytest.mark.asyncio
    async def test_batch_with_invalid_id(self, client, db_session):
        headers, pid, bid, ids = await self._setup_with_cases(client, db_session)
        import uuid
        fake_id = str(uuid.uuid4())

        # When: 包含一个不存在的 ID
        response = await client.post(f"/api/projects/{pid}/branches/{bid}/cases/batch", headers=headers, json={
            "action": "set_priority",
            "caseIds": [ids[0], fake_id],
            "priority": "P1",
        })

        # Then: 1 成功 1 失败
        data = response.json()["data"]
        assert data["succeeded"] == 1
        assert data["failed"] == 1
