"""
test_pipeline_reliability — 状态机流转 + 孤儿扫描 + 看门狗（ft-1-4 / ADR-1 / NFR17）
Test ID: FT.1.4-INT-001
Priority: P0
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models.scenario_gen import GenerationTask, TaskEvent
from app.services.scenario_gen import pipeline
from tests.api.scenario_gen.test_task_lifecycle import setup_project, base


async def _create_task(client, headers, pid, bid, title="流水线"):
    resp = await client.post(f"{base(pid, bid)}/tasks", headers=headers, json={
        "title": title, "contentMarkdown": "内容",
    })
    return resp.json()["data"]["id"]


class TestPipelineReliability:

    @pytest.mark.asyncio
    async def test_transition_valid_chain_and_event_seq(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_sm")
        task_id = await _create_task(client, headers, pid, bid)
        task = await db_session.get(GenerationTask, task_id)

        seqs = []
        for target in ("model_ready", "confirmed", "generating", "completed"):
            seqs.append(await pipeline.transition(db_session, task, target))
        assert task.status == "completed"
        assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)  # seq 严格递增

        events = (await db_session.execute(
            select(TaskEvent).where(TaskEvent.task_id == task.id).order_by(TaskEvent.id)
        )).scalars().all()
        assert [e.payload["status"] for e in events] == [
            "extracting", "model_ready", "confirmed", "generating", "completed",
        ]

    @pytest.mark.asyncio
    async def test_transition_invalid_rejected(self, client, db_session):
        headers, pid, bid = await setup_project(client, db_session, "sg_sm2")
        task_id = await _create_task(client, headers, pid, bid)
        task = await db_session.get(GenerationTask, task_id)

        # extracting 不能直接 generating（必须先经过模型确认）
        with pytest.raises(pipeline.InvalidTransition):
            await pipeline.transition(db_session, task, "generating")
        # 终态不可再流转
        await pipeline.transition(db_session, task, "aborted")
        with pytest.raises(pipeline.InvalidTransition):
            await pipeline.transition(db_session, task, "extracting")

    @pytest.mark.asyncio
    async def test_recover_orphans_marks_headless_active_task_failed(self, client, db_session, monkeypatch):
        """模拟进程重启：活动状态任务无 runner → failed 可续跑（NFR17）"""
        monkeypatch.setattr(
            pipeline, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_orphan")
        task_id = await _create_task(client, headers, pid, bid)  # status=extracting，无 runner

        count = await pipeline.recover_orphans()
        assert count == 1
        await db_session.refresh(await db_session.get(GenerationTask, task_id))
        task = await db_session.get(GenerationTask, task_id)
        assert task.status == "failed"
        assert task.error_message == pipeline.ORPHAN_MESSAGE

    @pytest.mark.asyncio
    async def test_watchdog_marks_stale_task_failed(self, client, db_session, monkeypatch):
        """看门狗：活动状态且 updated_at 超时 → failed，原因可读（NFR17）"""
        monkeypatch.setattr(
            pipeline, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_stale")
        task_id = await _create_task(client, headers, pid, bid)
        # 伪造超时：updated_at 拨回 40 分钟前
        stale = datetime.now(timezone.utc) - timedelta(minutes=40)
        await db_session.execute(
            update(GenerationTask).where(GenerationTask.id == task_id).values(updated_at=stale)
        )
        await db_session.commit()

        count = await pipeline.watchdog_scan_once()
        assert count == 1
        task = await db_session.get(GenerationTask, task_id)
        await db_session.refresh(task)
        assert task.status == "failed"
        assert "看门狗" in task.error_message

    @pytest.mark.asyncio
    async def test_watchdog_ignores_fresh_task(self, client, db_session, monkeypatch):
        monkeypatch.setattr(
            pipeline, "async_session_factory",
            async_sessionmaker(db_session.bind, expire_on_commit=False),
        )
        headers, pid, bid = await setup_project(client, db_session, "sg_fresh")
        task_id = await _create_task(client, headers, pid, bid)
        count = await pipeline.watchdog_scan_once()
        assert count == 0
        task = await db_session.get(GenerationTask, task_id)
        assert task.status == "extracting"
