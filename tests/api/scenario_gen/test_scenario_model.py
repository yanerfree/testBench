"""
test_scenario_model — 场景模型 CRUD + 确认推进（ft S3.1-S3.2）
Test ID: FT.3.1-API-001
Priority: P0
"""
import uuid as _uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.scenario_gen import ScenarioModel
from tests.api.scenario_gen.test_task_lifecycle import setup_project, base


async def _setup_task_with_model(client, db_session, username, test_points=None):
    """创建任务 + 需求点 + 确认 → model_ready，然后直接写 ScenarioModel"""
    headers, pid, bid = await setup_project(client, db_session, username)
    task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
        "title": "模型测试", "contentMarkdown": "# 需求\n用户可以登录。",
    })).json()["data"]
    tid = task["id"]
    await client.post(f"{base(pid, bid)}/tasks/{tid}/requirement-points", headers=headers, json={"title": "用户登录"})
    await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-requirements", headers=headers)
    # 直接在测试 session 中插入 ScenarioModel（共享同一个测试数据库）
    if test_points is None:
        test_points = [{"ref": "tp-1", "requirement_point_code": "R1", "dimension": "positive", "priority": "P0", "title": "登录成功"}]
    model = ScenarioModel(task_id=_uuid.UUID(tid), test_points=test_points, status="draft")
    db_session.add(model)
    await db_session.flush()
    return headers, pid, bid, tid


class TestScenarioModel:

    @pytest.mark.asyncio
    async def test_model_not_found_before_generation(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_mdl_nf")
        task = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "t", "contentMarkdown": "c",
        })).json()["data"]
        r = await client.get(f"{base(pid, bid)}/tasks/{task['id']}/scenario-model", headers=headers)
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_update_model_test_points(self, client, db_session):
        headers, pid, bid, tid = await _setup_task_with_model(client, db_session, "sg_mdl_up")
        r = await client.put(f"{base(pid, bid)}/tasks/{tid}/scenario-model", headers=headers, json={
            "testPoints": [
                {"ref": "tp-1", "requirement_point_code": "R1", "dimension": "positive", "priority": "P0", "title": "登录成功"},
                {"ref": "tp-2", "requirement_point_code": "R1", "dimension": "boundary", "priority": "P1", "title": "密码长度边界"},
            ],
            "editedFields": {"test_points": ["tp-2"]},
        })
        assert r.status_code == 200
        data = r.json()["data"]
        assert len(data["testPoints"]) == 2
        edited = data["editedFields"]
        assert "tp-2" in (edited.get("test_points") or edited.get("testPoints") or [])

    @pytest.mark.asyncio
    async def test_invalid_dimension_corrected(self, client, db_session):
        headers, pid, bid, tid = await _setup_task_with_model(client, db_session, "sg_mdl_dim")
        r = await client.put(f"{base(pid, bid)}/tasks/{tid}/scenario-model", headers=headers, json={
            "testPoints": [{"ref": "tp-1", "requirement_point_code": "R1", "dimension": "INVALID_TYPE", "priority": "P0", "title": "t"}],
        })
        assert r.status_code == 200
        assert r.json()["data"]["testPoints"][0]["dimension"] == "positive"

    @pytest.mark.asyncio
    async def test_confirm_model_success(self, client, db_session):
        headers, pid, bid, tid = await _setup_task_with_model(client, db_session, "sg_mdl_cfm")
        r = await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-model", headers=headers)
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["status"] == "confirmed"
        assert data["testPointCount"] == 1

    @pytest.mark.asyncio
    async def test_confirm_model_skip_mode(self, client, db_session):
        headers, pid, bid, tid = await _setup_task_with_model(client, db_session, "sg_mdl_skip",
            test_points=[{"ref": "tp-1", "requirement_point_code": "R1", "dimension": "state", "priority": "P1", "title": "t"}])
        r = await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-model?skip=true", headers=headers)
        assert r.status_code == 200
        model = (await client.get(f"{base(pid, bid)}/tasks/{tid}/scenario-model", headers=headers)).json()["data"]
        assert model["status"] == "skipped"

    @pytest.mark.asyncio
    async def test_confirm_model_no_test_points_rejected(self, client, db_session):
        headers, pid, bid, tid = await _setup_task_with_model(client, db_session, "sg_mdl_empty", test_points=[])
        r = await client.post(f"{base(pid, bid)}/tasks/{tid}/confirm-model", headers=headers)
        assert r.status_code == 400
