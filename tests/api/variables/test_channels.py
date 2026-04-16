"""
test_channels — 通知渠道 CRUD
Test ID: 3.3-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


class TestNotificationChannels:

    @pytest.mark.asyncio
    async def test_create_and_list(self, client, db_session):
        admin = await create_test_user(db_session, username="ch_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/channels", headers=headers, json={
            "name": "测试群", "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=abc123"
        })
        assert r.status_code == 201
        assert r.json()["data"]["name"] == "测试群"

        r2 = await client.get("/api/channels", headers=headers)
        assert any(c["name"] == "测试群" for c in r2.json()["data"])

    @pytest.mark.asyncio
    async def test_update_channel(self, client, db_session):
        admin = await create_test_user(db_session, username="ch_upd", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/channels", headers=headers, json={"name": "旧名", "webhookUrl": "https://old.url"})
        ch_id = r.json()["data"]["id"]

        r2 = await client.put(f"/api/channels/{ch_id}", headers=headers, json={"name": "新名"})
        assert r2.status_code == 200
        assert r2.json()["data"]["name"] == "新名"

    @pytest.mark.asyncio
    async def test_delete_channel(self, client, db_session):
        admin = await create_test_user(db_session, username="ch_del", role="admin")
        headers, _ = make_auth_headers(admin)

        r = await client.post("/api/channels", headers=headers, json={"name": "删除渠道", "webhookUrl": "https://x"})
        ch_id = r.json()["data"]["id"]

        r2 = await client.delete(f"/api/channels/{ch_id}", headers=headers)
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_duplicate_name_returns_409(self, client, db_session):
        admin = await create_test_user(db_session, username="ch_dup", role="admin")
        headers, _ = make_auth_headers(admin)

        await client.post("/api/channels", headers=headers, json={"name": "重复渠道", "webhookUrl": "https://x"})
        r = await client.post("/api/channels", headers=headers, json={"name": "重复渠道", "webhookUrl": "https://y"})
        assert r.status_code == 409
