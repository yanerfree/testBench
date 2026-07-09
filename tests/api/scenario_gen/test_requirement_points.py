"""
test_requirement_points — 需求点 CRUD + 确认推进（ft S2.5）
Test ID: FT.2.5-API-001
Priority: P0
"""
import pytest
from tests.api.scenario_gen.test_task_lifecycle import setup_project, base


class TestRequirementPoints:

    @pytest.mark.asyncio
    async def test_create_and_list_points(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_pts")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "需求点测试", "contentMarkdown": "# 需求\n用户可以登录。\n用户可以退出。",
        })).json()["data"]
        tid = task["id"]
        # 手工创建需求点
        r1 = await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={
            "title": "用户登录", "quoteText": "用户可以登录",
        })
        assert r1.status_code == 201
        p1 = r1.json()["data"]
        assert p1["anchorStatus"] == "anchored"
        assert p1["code"] == "R1"

        r2 = await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={
            "title": "用户退出", "quoteText": "用户可以退出",
        })
        assert r2.status_code == 201
        assert r2.json()["data"]["code"] == "R2"

        # 列表
        lst = await client.get(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers)
        assert lst.status_code == 200
        assert len(lst.json()["data"]) == 2

    @pytest.mark.asyncio
    async def test_update_point(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_pts_upd")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "更新测试", "contentMarkdown": "内容",
        })).json()["data"]
        tid = task["id"]
        p = (await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={
            "title": "原标题",
        })).json()["data"]

        r = await client.put(f"{base(pid, bid)}/tasks/{tid}/requirement-points/{p['id']}", headers=headers, json={
            "title": "新标题", "status": "not_applicable", "naReason": "转NFR",
        })
        assert r.status_code == 200
        assert r.json()["data"]["title"] == "新标题"
        assert r.json()["data"]["status"] == "not_applicable"

    @pytest.mark.asyncio
    async def test_delete_point(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_pts_del")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "删除测试", "contentMarkdown": "内容",
        })).json()["data"]
        tid = task["id"]
        p = (await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={
            "title": "待删除",
        })).json()["data"]
        r = await client.delete(f"{base(pid, bid)}/tasks/{tid}/requirement-points/{p['id']}", headers=headers)
        assert r.status_code == 200
        lst = await client.get(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers)
        assert len(lst.json()["data"]) == 0

    @pytest.mark.asyncio
    async def test_confirm_requirements_needs_active_points(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_pts_cfm")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "确认测试", "contentMarkdown": "内容",
        })).json()["data"]
        tid = task["id"]
        # 无需求点 → 拒绝
        r1 = await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-requirements", headers=headers)
        assert r1.status_code == 400
        # 添加需求点后 → 成功
        await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={"title": "功能1"})
        r2 = await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-requirements", headers=headers)
        assert r2.status_code == 200
        assert r2.json()["data"]["status"] == "model_ready"

    @pytest.mark.asyncio
    async def test_health_check_endpoint(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_pts_hc")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "健康检测", "contentMarkdown": "内容",
        })).json()["data"]
        r = await client.get(f"{base(pid, bid)}/tasks/{task['id']}/health-check", headers=headers)
        assert r.status_code == 200
        assert "score" in r.json()["data"]
