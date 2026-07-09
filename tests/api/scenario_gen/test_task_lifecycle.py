"""
test_task_lifecycle — 生成任务创建/列表/详情/中止（ft-1-4）
Test ID: FT.1.4-API-001
Priority: P0
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


async def setup_project(client, db_session, username="sg_admin"):
    admin = await create_test_user(db_session, username=username, role="admin")
    headers, _ = make_auth_headers(admin)
    r = await client.post("/api/projects", headers=headers, json={
        "name": f"sg-proj-{username}", "gitUrl": "git@x.com:r.git", "scriptBasePath": "/s",
    })
    pid = r.json()["data"]["id"]
    br = await client.get(f"/api/projects/{pid}/branches", headers=headers)
    bid = br.json()["data"][0]["id"]
    return headers, pid, bid


def base(pid, bid):
    return f"/api/projects/{pid}/branches/{bid}/scenario-gen"


class TestTaskLifecycle:

    @pytest.mark.asyncio
    async def test_create_task_success(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_create")
        resp = await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "订单退款需求",
            "contentMarkdown": "# 需求\n用户可对已发货订单发起部分退款。",
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()["data"]
        assert data["status"] == "extracting"
        assert data["docId"] is not None
        assert data["lastSeq"] >= 1  # 创建即有 task_state 事件
        assert data["errorMessage"] is None

    @pytest.mark.asyncio
    async def test_create_task_validation(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_valid")
        # 空内容
        r1 = await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "t", "contentMarkdown": "   ",
        })
        assert r1.status_code == 400
        # 超长内容
        r2 = await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "t", "contentMarkdown": "x" * 200_001,
        })
        assert r2.status_code == 400
        assert "上限" in r2.json().get("message", "") or "上限" in r2.text

    @pytest.mark.asyncio
    async def test_list_tasks(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_list")
        for i in range(3):
            await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
                "title": f"任务{i}", "contentMarkdown": "内容",
            })
        resp = await client.get(f"{base(pid, bid)}/tasks", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total"] == 3
        assert len(data["items"]) == 3
        # 按创建时间倒序
        assert data["items"][0]["title"] == "任务2"
        # 状态筛选
        resp2 = await client.get(f"{base(pid, bid)}/tasks?status=completed", headers=headers)
        assert resp2.json()["data"]["total"] == 0

    @pytest.mark.asyncio
    async def test_get_task_snapshot_with_last_seq(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_get")
        created = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "快照", "contentMarkdown": "内容",
        })).json()["data"]
        resp = await client.get(f"{base(pid, bid)}/tasks/{created['id']}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["id"] == created["id"]
        assert data["lastSeq"] == created["lastSeq"]

    @pytest.mark.asyncio
    async def test_abort_task_and_invalid_second_abort(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_abort")
        created = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "中止", "contentMarkdown": "内容",
        })).json()["data"]
        r1 = await client.post(f"{base(pid, bid)}/tasks/{created['id']}/abort", headers=headers)
        assert r1.status_code == 200
        assert r1.json()["data"]["status"] == "aborted"
        # 终态不可再流转（非法流转拒绝）
        r2 = await client.post(f"{base(pid, bid)}/tasks/{created['id']}/abort", headers=headers)
        assert r2.status_code == 409

    @pytest.mark.asyncio
    async def test_get_task_not_found(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_404")
        resp = await client.get(
            f"{base(pid, bid)}/tasks/00000000-0000-0000-0000-000000000000", headers=headers
        )
        assert resp.status_code == 404
