"""
test_list_cases — 用例列表分页与筛选
Test ID: 2.6-API-001
Priority: P0
"""
import io
import json

import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestListCases:
    """GET /api/projects/{pid}/branches/{bid}/cases — 分页 + 筛选"""

    async def _setup_with_cases(self, client, db_session):
        """辅助：创建项目 + 导入多种用例"""
        admin = await create_test_user(db_session, username="list_case_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "list-case-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/lc",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]

        # 导入一批用例
        content = json.dumps({"version": "1.0", "cases": [
            {"tea_id": "lc_auth_1", "title": "登录成功", "type": "api", "module": "auth", "priority": "P0",
             "script_ref": {"file": "t1.py"}},
            {"tea_id": "lc_auth_2", "title": "登录失败", "type": "api", "module": "auth", "priority": "P1",
             "script_ref": {"file": "t2.py"}},
            {"tea_id": "lc_e2e_1", "title": "完整登录流程", "type": "e2e", "module": "auth", "priority": "P0",
             "script_ref": {"file": "e1.py"}},
            {"tea_id": "lc_users_1", "title": "创建用户", "type": "api", "module": "users", "priority": "P2",
             "script_ref": {"file": "u1.py"}},
        ]}).encode()
        await client.post(
            f"/api/projects/{pid}/branches/{bid}/cases/import",
            headers=headers,
            files={"file": ("tea-cases.json", io.BytesIO(content), "application/json")},
        )

        # 手动创建一条并标记 flaky
        cr = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "Flaky 用例", "type": "api", "module": "auth",
            "priority": "P0", "steps": [{"action": "test"}],
        })
        flaky_id = cr.json()["data"]["id"]
        await client.put(f"/api/projects/{pid}/branches/{bid}/cases/{flaky_id}", headers=headers, json={
            "isFlaky": True,
        })

        return headers, pid, bid

    @pytest.mark.asyncio
    async def test_list_all_with_pagination(self, client, db_session):
        headers, pid, bid = await self._setup_with_cases(client, db_session)

        # When: 默认分页
        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers)

        # Then: 返回 5 条 + 分页信息
        assert response.status_code == 200
        body = response.json()
        assert len(body["data"]) == 5
        assert body["pagination"]["total"] == 5
        assert body["pagination"]["page"] == 1

    @pytest.mark.asyncio
    async def test_filter_by_type(self, client, db_session):
        headers, pid, bid = await self._setup_with_cases(client, db_session)

        # When: 按 type=e2e 筛选
        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases?type=e2e", headers=headers)

        # Then: 只返回 e2e 用例
        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data) == 1
        assert data[0]["type"] == "e2e"

    @pytest.mark.asyncio
    async def test_filter_by_priority(self, client, db_session):
        headers, pid, bid = await self._setup_with_cases(client, db_session)

        # When: 按 priority=P0 筛选
        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases?priority=P0", headers=headers)

        # Then: 返回 P0 用例（导入 2 条 + 手动 1 条 = 3）
        assert response.status_code == 200
        data = response.json()["data"]
        assert all(c["priority"] == "P0" for c in data)
        assert len(data) == 3

    @pytest.mark.asyncio
    async def test_filter_by_flaky(self, client, db_session):
        headers, pid, bid = await self._setup_with_cases(client, db_session)

        # When: 筛选 flaky
        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases?isFlaky=true", headers=headers)

        # Then: 只返回标记 flaky 的
        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data) == 1
        assert data[0]["isFlaky"] is True

    @pytest.mark.asyncio
    async def test_keyword_search(self, client, db_session):
        headers, pid, bid = await self._setup_with_cases(client, db_session)

        # When: 搜索关键字"登录"
        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases?keyword=登录", headers=headers)

        # Then: 返回包含"登录"的用例
        assert response.status_code == 200
        data = response.json()["data"]
        assert len(data) >= 2
        assert all("登录" in c["title"] for c in data)

    @pytest.mark.asyncio
    async def test_pagination_page_size(self, client, db_session):
        headers, pid, bid = await self._setup_with_cases(client, db_session)

        # When: pageSize=2
        response = await client.get(f"/api/projects/{pid}/branches/{bid}/cases?pageSize=2", headers=headers)

        # Then: 只返回 2 条，total 仍是 5
        assert response.status_code == 200
        body = response.json()
        assert len(body["data"]) == 2
        assert body["pagination"]["total"] == 5
        assert body["pagination"]["pageSize"] == 2
