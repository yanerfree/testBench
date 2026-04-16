"""
test_global_variables — 全局变量 CRUD
Test ID: 3.1-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestGlobalVariables:
    """全局变量 CRUD API"""

    @pytest.mark.asyncio
    async def test_create_and_list(self, client, db_session):
        admin = await create_test_user(db_session, username="gvar_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # 创建
        r = await client.post("/api/global-variables", headers=headers, json={
            "key": "API_TIMEOUT", "value": "30", "description": "全局超时"
        })
        assert r.status_code == 201
        assert r.json()["data"]["key"] == "API_TIMEOUT"

        # 列表
        r2 = await client.get("/api/global-variables", headers=headers)
        assert r2.status_code == 200
        keys = [v["key"] for v in r2.json()["data"]]
        assert "API_TIMEOUT" in keys

    @pytest.mark.asyncio
    async def test_update_variable(self, client, db_session):
        admin = await create_test_user(db_session, username="gvar_upd", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/global-variables", headers=headers, json={"key": "UPD_VAR", "value": "old"})
        var_id = r.json()["data"]["id"]

        r2 = await client.put(f"/api/global-variables/{var_id}", headers=headers, json={"value": "new"})
        assert r2.status_code == 200
        assert r2.json()["data"]["value"] == "new"

    @pytest.mark.asyncio
    async def test_delete_variable(self, client, db_session):
        admin = await create_test_user(db_session, username="gvar_del", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/global-variables", headers=headers, json={"key": "DEL_VAR", "value": "x"})
        var_id = r.json()["data"]["id"]

        r2 = await client.delete(f"/api/global-variables/{var_id}", headers=headers)
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_duplicate_key_returns_409(self, client, db_session):
        admin = await create_test_user(db_session, username="gvar_dup", role="admin")
        headers, _ = make_auth_headers(admin)

        await client.post("/api/global-variables", headers=headers, json={"key": "DUP_KEY", "value": "1"})
        r = await client.post("/api/global-variables", headers=headers, json={"key": "DUP_KEY", "value": "2"})
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_reserved_key_returns_422(self, client, db_session):
        admin = await create_test_user(db_session, username="gvar_rsv", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/global-variables", headers=headers, json={"key": "PATH", "value": "/usr/bin"})
        assert r.status_code == 422
        assert r.json()["error"]["code"] == "RESERVED_KEY"
