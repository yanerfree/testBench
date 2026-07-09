"""
test_task_events_sse — SSE 事件回放：先回放历史再实时，终态收口（ft-1-4 / ADR-3 / FR63）
Test ID: FT.1.4-API-002
Priority: P0
"""
import json

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

import app.api.scenario_gen as scenario_gen_api
from tests.api.scenario_gen.test_task_lifecycle import setup_project, base


async def collect_sse(client, url, headers):
    """消费 SSE 直到流关闭，返回解析后的 data 事件列表。"""
    events = []
    async with client.stream("GET", url, headers=headers) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: "):]))
    return events


class TestTaskEventsSSE:

    @pytest.mark.asyncio
    async def test_replay_then_stream_end_on_terminal(self, client, db_session, monkeypatch):
        # SSE 生成器用独立会话轮询 —— 指到测试库
        monkeypatch.setattr(
            scenario_gen_api, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_sse")
        created = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "SSE回放", "contentMarkdown": "内容",
        })).json()["data"]
        task_id = created["id"]
        # 中止 → 终态 + 第二条 task_state 事件
        await client.post(f"{base(pid, bid)}/tasks/{task_id}/abort", headers=headers)

        # 全量回放（after_seq=0）：2 条 task_state + stream_end
        events = await collect_sse(client, f"{base(pid, bid)}/tasks/{task_id}/events?afterSeq=0", headers)
        types = [e["type"] for e in events]
        assert types == ["task_state", "task_state", "stream_end"]
        assert events[0]["payload"]["status"] == "extracting"
        assert events[1]["payload"]["status"] == "aborted"
        assert events[-1]["task_status"] == "aborted"
        # seq 严格递增
        seqs = [e["seq"] for e in events[:-1]]
        assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)

    @pytest.mark.asyncio
    async def test_replay_from_cursor_skips_consumed(self, client, db_session, monkeypatch):
        monkeypatch.setattr(
            scenario_gen_api, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_sse2")
        created = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "断点续传", "contentMarkdown": "内容",
        })).json()["data"]
        task_id = created["id"]
        first_seq = created["lastSeq"]
        await client.post(f"{base(pid, bid)}/tasks/{task_id}/abort", headers=headers)

        # 从已消费位点续传：只应收到 abort 事件 + stream_end（刷新/断线不重复、不丢失）
        events = await collect_sse(
            client, f"{base(pid, bid)}/tasks/{task_id}/events?afterSeq={first_seq}", headers
        )
        types = [e["type"] for e in events]
        assert types == ["task_state", "stream_end"]
        assert events[0]["payload"]["status"] == "aborted"
        assert events[0]["seq"] > first_seq

    @pytest.mark.asyncio
    async def test_live_push_after_catchup(self, client, db_session, monkeypatch):
        """追平历史后进入实时推送：新事件在轮询间隔内到达，终态收口（NFR4）"""
        import asyncio
        from app.models.scenario_gen import GenerationTask
        from app.services.scenario_gen import pipeline

        monkeypatch.setattr(
            scenario_gen_api, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_live")
        created = (await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
            "title": "实时推送", "contentMarkdown": "内容",
        })).json()["data"]
        task_id = created["id"]

        async def delayed_producer():
            factory = async_sessionmaker(db_session.bind, expire_on_commit=False)
            await asyncio.sleep(0.7)
            async with factory() as s:
                await pipeline.emit_event(s, created["id"], "point_start", {"ref": "tp-1"})
                await s.commit()
            await asyncio.sleep(0.7)
            async with factory() as s:
                task = await s.get(GenerationTask, task_id)
                await pipeline.transition(s, task, "aborted", error_message="测试收口")
                await s.commit()

        producer = asyncio.create_task(delayed_producer())
        events = await collect_sse(client, f"{base(pid, bid)}/tasks/{task_id}/events?afterSeq=0", headers)
        await producer

        types = [e["type"] for e in events]
        assert types == ["task_state", "point_start", "task_state", "stream_end"]
        assert events[1]["payload"] == {"ref": "tp-1"}
        assert events[2]["payload"]["status"] == "aborted"
