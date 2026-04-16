"""
test_create_case — 手动创建用例
Test ID: 2.4-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestCreateCase:
    """POST /api/projects/{pid}/branches/{bid}/cases"""

    async def _setup(self, client, db_session):
        admin = await create_test_user(db_session, username="case_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        r = await client.post("/api/projects", headers=headers, json={
            "name": "case-proj", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/c",
        })
        pid = r.json()["data"]["id"]
        br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
        bid = br.json()["data"][0]["id"]
        return headers, pid, bid

    @pytest.mark.asyncio
    async def test_create_case_success(self, client, db_session):
        headers, pid, bid = await self._setup(client, db_session)

        response = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "手动登录测试",
            "type": "api",
            "module": "auth",
            "submodule": "login",
            "priority": "P0",
            "steps": [{"action": "输入用户名密码", "expected": "登录成功"}],
        })

        assert response.status_code == 201
        data = response.json()["data"]
        assert data["title"] == "手动登录测试"
        assert data["caseCode"].startswith("TC-AUTH-")
        assert data["source"] == "manual"
        assert data["automationStatus"] == "pending"

    @pytest.mark.asyncio
    async def test_create_case_auto_generates_folder(self, client, db_session):
        headers, pid, bid = await self._setup(client, db_session)

        # 创建一个新模块的用例
        response = await client.post(f"/api/projects/{pid}/branches/{bid}/cases", headers=headers, json={
            "title": "订单测试",
            "type": "e2e",
            "module": "orders",
            "priority": "P1",
            "steps": [{"action": "创建订单"}],
        })

        assert response.status_code == 201
        assert response.json()["data"]["caseCode"].startswith("TC-ORDERS-")
