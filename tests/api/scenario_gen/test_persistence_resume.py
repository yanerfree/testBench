"""
test_persistence_resume — 中间产物持久化与断点恢复验证（ft S3.3 / FR11 / NFR17）

端到端验证：任一阶段离开/刷新/重启服务，从任务中心恢复到正确阶段，内容完好。
对标 Aemeath "设计稿活在会话里"反例的验收级防守。
"""
import uuid as _uuid

import pytest
from app.models.scenario_gen import GenerationTask, RequirementPoint, ScenarioModel
from tests.api.scenario_gen.test_task_lifecycle import setup_project, base


class TestPersistenceAndResume:

    @pytest.mark.asyncio
    async def test_task_recoverable_after_creation(self, client, db_session):
        """创建任务后重新 GET 能拿到完整数据"""
        headers, pid, bid = await setup_project(client, db_session, "sg_persist1")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "持久化测试", "contentMarkdown": "# 需求\n用户可登录。",
        })).json()["data"]
        # 模拟"离开页面再回来"：重新 GET
        r = await client.get(f"{base(pid, bid)}/tasks/{task['id']}", headers=headers)
        assert r.status_code == 200
        recovered = r.json()["data"]
        assert recovered["title"] == "持久化测试"
        assert recovered["status"] == "extracting"
        assert recovered["lastSeq"] >= 1

    @pytest.mark.asyncio
    async def test_requirement_points_survive_refresh(self, client, db_session):
        """需求点在确认前编辑后，重新 GET 能拿回"""
        headers, pid, bid = await setup_project(client, db_session, "sg_persist2")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "需求点持久化", "contentMarkdown": "内容",
        })).json()["data"]
        tid = task["id"]
        # 创建需求点
        p1 = (await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={
            "title": "登录功能",
        })).json()["data"]
        # 编辑需求点
        await client.put(f"{base(pid, bid)}/tasks/{tid}/requirement-points/{p1['id']}", headers=headers, json={
            "title": "登录功能（已编辑）",
        })
        # 模拟刷新页面：重新 GET 需求点列表
        points = (await client.get(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers)).json()["data"]
        assert len(points) == 1
        assert points[0]["title"] == "登录功能（已编辑）"

    @pytest.mark.asyncio
    async def test_scenario_model_survives_refresh(self, client, db_session):
        """场景模型编辑后，重新 GET 能拿回编辑内容"""
        headers, pid, bid = await setup_project(client, db_session, "sg_persist3")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "模型持久化", "contentMarkdown": "内容",
        })).json()["data"]
        tid = task["id"]
        await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={"title": "功能1"})
        await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-requirements", headers=headers)
        # 直接在 DB 中插入模型（模拟 modeler 生成完成）
        model = ScenarioModel(
            task_id=_uuid.UUID(tid),
            test_points=[{"ref": "tp-1", "requirement_point_code": "R1", "dimension": "positive", "priority": "P0", "title": "原始"}],
            status="draft",
        )
        db_session.add(model)
        await db_session.flush()
        # 编辑模型
        await client.put(f"{base(pid, bid)}/tasks/{tid}/scenario-model", headers=headers, json={
            "testPoints": [
                {"ref": "tp-1", "requirement_point_code": "R1", "dimension": "positive", "priority": "P0", "title": "已编辑"},
            ],
            "editedFields": {"test_points": ["tp-1"]},
        })
        # 模拟刷新：重新 GET 场景模型
        recovered = (await client.get(f"{base(pid, bid)}/tasks/{tid}/scenario-model", headers=headers)).json()["data"]
        assert recovered["testPoints"][0]["title"] == "已编辑"
        edited = recovered["editedFields"]
        assert "tp-1" in (edited.get("test_points") or edited.get("testPoints") or [])

    @pytest.mark.asyncio
    async def test_task_center_lists_all_stages(self, client, db_session):
        """任务中心能列出各种状态的任务，行点击可恢复"""
        headers, pid, bid = await setup_project(client, db_session, "sg_persist4")
        # 创建两个任务：一个 extracting，一个 aborted
        t1 = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "进行中", "contentMarkdown": "c1",
        })).json()["data"]
        t2 = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "已中止", "contentMarkdown": "c2",
        })).json()["data"]
        await client.post(f"{base(pid, bid)}/tasks/{t2['id']}/abort", headers=headers)
        # 任务中心列表
        lst = (await client.get(f"{base(pid, bid)}/tasks", headers=headers)).json()["data"]
        assert lst["total"] == 2
        statuses = {item["title"]: item["status"] for item in lst["items"]}
        assert statuses["进行中"] == "extracting"
        assert statuses["已中止"] == "aborted"
        # 每个任务的 GET 都正常
        for item in lst["items"]:
            r = await client.get(f"{base(pid, bid)}/tasks/{item['id']}", headers=headers)
            assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_sse_replay_recovers_full_history(self, client, db_session, monkeypatch):
        """SSE 从 seq=0 回放恢复完整事件历史"""
        import json
        from sqlalchemy.ext.asyncio import async_sessionmaker
        import app.api.scenario_gen as scenario_gen_api
        monkeypatch.setattr(
            scenario_gen_api, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_persist5")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "SSE恢复", "contentMarkdown": "c",
        })).json()["data"]
        await client.post(f"{base(pid, bid)}/tasks/{task['id']}/abort", headers=headers)
        # 全量回放
        events = []
        async with client.stream("GET", f"{base(pid, bid)}/tasks/{task['id']}/events?afterSeq=0", headers=headers) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    events.append(json.loads(line[6:]))
        types = [e["type"] for e in events]
        assert "task_state" in types
        assert types[-1] == "stream_end"
