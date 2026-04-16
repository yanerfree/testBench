"""
test_environments — 环境与环境变量 CRUD + 合并预览 + 克隆
Test ID: 3.2-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestEnvironments:

    @pytest.mark.asyncio
    async def test_create_and_list_env(self, client, db_session):
        admin = await create_test_user(db_session, username="env_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/environments", headers=headers, json={"name": "staging", "description": "预发布环境"})
        assert r.status_code == 201
        assert r.json()["data"]["name"] == "staging"

        r2 = await client.get("/api/environments", headers=headers)
        assert any(e["name"] == "staging" for e in r2.json()["data"])

    @pytest.mark.asyncio
    async def test_put_and_list_env_variables(self, client, db_session):
        admin = await create_test_user(db_session, username="envvar_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/environments", headers=headers, json={"name": "dev"})
        env_id = r.json()["data"]["id"]

        # 批量写入变量
        r2 = await client.put(f"/api/environments/{env_id}/variables", headers=headers, json=[
            {"key": "DB_HOST", "value": "localhost"},
            {"key": "DB_PORT", "value": "5432"},
        ])
        assert r2.status_code == 200
        assert len(r2.json()["data"]) == 2

        # 查询
        r3 = await client.get(f"/api/environments/{env_id}/variables", headers=headers)
        keys = [v["key"] for v in r3.json()["data"]]
        assert "DB_HOST" in keys
        assert "DB_PORT" in keys

    @pytest.mark.asyncio
    async def test_merged_variables(self, client, db_session):
        admin = await create_test_user(db_session, username="merge_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # 创建全局变量
        await client.post("/api/global-variables", headers=headers, json={"key": "TIMEOUT", "value": "30"})
        await client.post("/api/global-variables", headers=headers, json={"key": "SHARED", "value": "global_val"})

        # 创建环境 + 环境变量（覆盖 SHARED）
        r = await client.post("/api/environments", headers=headers, json={"name": "merge_env"})
        env_id = r.json()["data"]["id"]
        await client.put(f"/api/environments/{env_id}/variables", headers=headers, json=[
            {"key": "SHARED", "value": "env_val"},
            {"key": "ENV_ONLY", "value": "x"},
        ])

        # 合并预览
        r2 = await client.get(f"/api/environments/{env_id}/merged-variables", headers=headers)
        merged = {v["key"]: v for v in r2.json()["data"]}
        assert merged["TIMEOUT"]["source"] == "global"
        assert merged["SHARED"]["source"] == "environment"
        assert merged["SHARED"]["value"] == "env_val"
        assert merged["ENV_ONLY"]["source"] == "environment"

    @pytest.mark.asyncio
    async def test_clone_environment(self, client, db_session):
        admin = await create_test_user(db_session, username="clone_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/environments", headers=headers, json={"name": "source_env"})
        env_id = r.json()["data"]["id"]
        await client.put(f"/api/environments/{env_id}/variables", headers=headers, json=[
            {"key": "KEY_A", "value": "val_a"},
        ])

        # 克隆
        r2 = await client.post(f"/api/environments/{env_id}/clone", headers=headers, json={"name": "cloned_env"})
        assert r2.status_code == 201
        cloned_id = r2.json()["data"]["id"]

        # 验证变量已复制
        r3 = await client.get(f"/api/environments/{cloned_id}/variables", headers=headers)
        assert any(v["key"] == "KEY_A" for v in r3.json()["data"])

    @pytest.mark.asyncio
    async def test_duplicate_env_name_returns_409(self, client, db_session):
        admin = await create_test_user(db_session, username="envdup_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        await client.post("/api/environments", headers=headers, json={"name": "dup_env"})
        r = await client.post("/api/environments", headers=headers, json={"name": "dup_env"})
        assert r.status_code == 409
