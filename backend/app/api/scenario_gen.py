"""功能场景测试模块 — 生成任务 API（ft-1-4 底座）

端点（前缀 /api/projects/{project_id}/branches/{branch_id}/scenario-gen）:
- POST /tasks               创建生成任务（S2.1 将扩展增强上下文与提取 runner 挂接）
- GET  /tasks               历史任务列表（FR36）
- GET  /tasks/{id}          任务全量快照（含 last_seq，SSE 回放起点）
- POST /tasks/{id}/abort    中止任务
- GET  /tasks/{id}/events   SSE：after_seq 增量回放 → 追平后实时推送（ADR-3 / FR63）
"""
import asyncio
import json
import time
import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.schemas.common import BaseSchema
from app.deps.auth import require_project_role
from app.deps.db import async_session_factory, get_db
from app.models.scenario_gen import GenerationTask, RequirementDoc, TaskEvent
from app.models.user import User
from app.services.scenario_gen import pipeline
from app.core.audit import write_audit_log

router = APIRouter(
    prefix="/api/projects/{project_id}/branches/{branch_id}/scenario-gen",
    tags=["scenario-gen"],
)

# S1.2 阈值配置链接入后改读配置
MAX_CONTENT_CHARS = 200_000

EDIT_ROLES = ("project_admin", "developer", "tester")
READ_ROLES = ("project_admin", "developer", "tester", "viewer")


def _task_to_dict(t: GenerationTask, *, last_seq: int | None = None) -> dict:
    d = {
        "id": str(t.id),
        "project_id": str(t.project_id),
        "branch_id": str(t.branch_id),
        "doc_id": str(t.doc_id) if t.doc_id else None,
        "title": t.title,
        "status": t.status,
        "settings": t.settings,
        "context_summary": t.context_summary,
        "health_check": t.health_check,
        "progress": t.progress,
        "token_estimated": t.token_estimated,
        "token_used": t.token_used,
        "error_message": t.error_message,
        "created_by": str(t.created_by) if t.created_by else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    if last_seq is not None:
        d["last_seq"] = last_seq
    return d


class CreateTaskRequest(BaseSchema):
    title: str
    content_markdown: str
    source: str = "paste"  # paste / upload
    filename: str | None = None
    settings: dict | None = None


@router.post("/tasks", status_code=201)
async def create_task(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: CreateTaskRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role(*EDIT_ROLES)),
):
    """创建生成任务（含需求材料快照）。提取 runner 由 S2.3 挂接。"""
    title = body.title.strip()
    if not title:
        raise AppError(code="TITLE_REQUIRED", message="任务名称不能为空", status_code=400)
    content = body.content_markdown
    if not content or not content.strip():
        raise AppError(code="CONTENT_REQUIRED", message="需求材料不能为空", status_code=400)
    if len(content) > MAX_CONTENT_CHARS:
        raise AppError(
            code="CONTENT_TOO_LONG",
            message=f"需求材料超过上限（{MAX_CONTENT_CHARS} 字符），请拆分后分批生成",
            status_code=400,
        )
    if body.source not in ("paste", "upload"):
        raise AppError(code="INVALID_SOURCE", message="source 仅支持 paste/upload", status_code=400)

    doc = RequirementDoc(
        project_id=project_id,
        branch_id=branch_id,
        source=body.source,
        filename=body.filename,
        content_markdown=content,
        content_meta={"char_count": len(content)},
        created_by=current_user.id,
    )
    session.add(doc)
    await session.flush()

    task = GenerationTask(
        project_id=project_id,
        branch_id=branch_id,
        doc_id=doc.id,
        title=title[:200],
        status="extracting",
        settings=body.settings,
        created_by=current_user.id,
    )
    session.add(task)
    await session.flush()
    seq = await pipeline.emit_event(session, task.id, "task_state", {"status": "extracting"})
    await session.commit()

    await write_audit_log(
        session, action="create", target_type="generation_task",
        target_id=task.id, target_name=task.title,
        user_id=current_user.id, project_id=project_id,
    )
    return {"data": _task_to_dict(task, last_seq=seq)}


@router.get("/tasks")
async def list_tasks(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    status: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role(*READ_ROLES)),
):
    """历史生成任务列表（FR36）"""
    cond = [GenerationTask.project_id == project_id, GenerationTask.branch_id == branch_id]
    if status:
        cond.append(GenerationTask.status == status)
    total = (await session.execute(select(func.count(GenerationTask.id)).where(*cond))).scalar_one()
    result = await session.execute(
        select(GenerationTask).where(*cond)
        .order_by(GenerationTask.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    items = [_task_to_dict(t) for t in result.scalars().all()]
    return {"data": {"items": items, "total": total, "page": page, "page_size": page_size}}


async def _get_task_checked(
    session: AsyncSession, project_id: uuid.UUID, branch_id: uuid.UUID, task_id: uuid.UUID
) -> GenerationTask:
    task = await session.get(GenerationTask, task_id)
    if not task or task.project_id != project_id or task.branch_id != branch_id:
        raise NotFoundError(code="NOT_FOUND", message="生成任务不存在")
    return task


@router.get("/tasks/{task_id}")
async def get_task(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role(*READ_ROLES)),
):
    """任务全量快照 + last_seq（前端先渲染快照，再带 after_seq=last_seq 订阅增量）"""
    task = await _get_task_checked(session, project_id, branch_id, task_id)
    seq = await pipeline.last_seq(session, task.id)
    return {"data": _task_to_dict(task, last_seq=seq)}


@router.post("/tasks/{task_id}/abort")
async def abort_task(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role(*EDIT_ROLES)),
):
    task = await _get_task_checked(session, project_id, branch_id, task_id)
    runner = pipeline._RUNNING.get(task.id)
    if runner is not None and not runner.done():
        runner.cancel()
    try:
        await pipeline.transition(session, task, "aborted", error_message="用户中止")
    except pipeline.InvalidTransition as e:
        raise AppError(code="INVALID_TRANSITION", message=str(e), status_code=409)
    await session.commit()
    await session.refresh(task)  # onupdate 的 updated_at 由 DB 生成，取回避免惰性 IO
    await write_audit_log(
        session, action="abort", target_type="generation_task",
        target_id=task.id, target_name=task.title,
        user_id=current_user.id, project_id=project_id,
    )
    return {"data": _task_to_dict(task)}


# ── SSE：回放 + 实时（ADR-3）────────────────────────────────────────

SSE_POLL_INTERVAL = 0.5      # 秒；轮询 DB 增量（NFR4 <2s 余量充足）
SSE_HEARTBEAT_SECONDS = 15   # 空闲心跳，防中间层断连
SSE_MAX_DURATION = 30 * 60   # 单连接上限，前端会自动重连续传
SSE_BATCH_LIMIT = 200


def _sse_line(event: TaskEvent) -> str:
    data = {
        "seq": event.id,
        "type": event.event_type,
        "payload": event.payload,
        "ts": event.created_at.isoformat() if event.created_at else None,
    }
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/tasks/{task_id}/events")
async def task_events_stream(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    task_id: uuid.UUID,
    after_seq: int = Query(default=0, ge=0, alias="afterSeq"),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role(*READ_ROLES)),
):
    """先回放 seq>after_seq 的历史事件，追平后转实时推送；任务终态且无新事件时发 stream_end 关闭。

    每轮轮询用独立短会话，不长期占用连接池。
    """
    await _get_task_checked(session, project_id, branch_id, task_id)

    async def gen():
        cursor = after_seq
        started = time.monotonic()
        last_sent = time.monotonic()
        while True:
            async with async_session_factory() as s:
                result = await s.execute(
                    select(TaskEvent)
                    .where(TaskEvent.task_id == task_id, TaskEvent.id > cursor)
                    .order_by(TaskEvent.id)
                    .limit(SSE_BATCH_LIMIT)
                )
                events = list(result.scalars().all())
                task_status = (
                    await s.execute(select(GenerationTask.status).where(GenerationTask.id == task_id))
                ).scalar_one_or_none()

            for ev in events:
                yield _sse_line(ev)
                cursor = ev.id
                last_sent = time.monotonic()

            if len(events) == SSE_BATCH_LIMIT:
                continue  # 还有积压，立即继续回放

            if task_status is None or task_status in pipeline.TERMINAL_STATUSES:
                yield f"data: {json.dumps({'type': 'stream_end', 'task_status': task_status, 'seq': cursor}, ensure_ascii=False)}\n\n"
                return
            if time.monotonic() - started > SSE_MAX_DURATION:
                yield f"data: {json.dumps({'type': 'stream_end', 'reason': 'max_duration', 'seq': cursor}, ensure_ascii=False)}\n\n"
                return
            if time.monotonic() - last_sent > SSE_HEARTBEAT_SECONDS:
                yield ": ping\n\n"
                last_sent = time.monotonic()
            await asyncio.sleep(SSE_POLL_INTERVAL)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
