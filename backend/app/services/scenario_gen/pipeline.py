"""生成任务编排底座（功能场景测试模块，ADR-1 / ADR-3）

- 任务状态机：非法流转直接拒绝
- 进程内 asyncio 后台任务：强引用集合 + 看门狗 + 启动孤儿扫描（NFR17）
- task_events 事件流水：TaskEvent.id（BigInt 自增）即 SSE 回放 seq

不引入 Celery/Redis/编排框架 —— 见 architecture-func-test.md ADR-1/ADR-10。
"""
import asyncio
import logging
import uuid
from collections.abc import Coroutine
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.db import async_session_factory
from app.models.scenario_gen import GenerationTask, TaskEvent

logger = logging.getLogger("scenario_gen")

# ── 状态机 ──────────────────────────────────────────────────────────

ACTIVE_STATUSES = {"extracting", "generating"}
TERMINAL_STATUSES = {"completed", "partial_failed", "failed", "aborted"}

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "extracting": {"model_ready", "failed", "aborted"},
    "model_ready": {"confirmed", "extracting", "aborted"},  # extracting: 重新提取
    "confirmed": {"generating", "aborted"},
    "generating": {"completed", "partial_failed", "failed", "aborted"},
    "partial_failed": {"generating", "aborted"},  # 续跑失败项
    "failed": {"extracting", "generating", "aborted"},  # 按失败阶段续跑
    "completed": set(),
    "aborted": set(),
}

# 阈值（S1.2 阈值配置链接入后改为读 scenario_gen_settings）
WATCHDOG_TIMEOUT = timedelta(minutes=30)
WATCHDOG_INTERVAL_SECONDS = 60
MAX_PARALLEL_TASKS = 3  # NFR13 任务级并发上限

# ── 后台任务可靠性四件套（NFR17）────────────────────────────────────

_BG_TASKS: set[asyncio.Task] = set()          # 强引用，防 GC 静默丢任务
_RUNNING: dict[uuid.UUID, asyncio.Task] = {}  # task_id → 活动 runner（孤儿判定依据）
_task_semaphore = asyncio.Semaphore(MAX_PARALLEL_TASKS)


class InvalidTransition(Exception):
    def __init__(self, current: str, target: str):
        self.current, self.target = current, target
        super().__init__(f"非法状态流转: {current} → {target}")


def spawn(coro: Coroutine, *, name: str, gen_task_id: uuid.UUID | None = None) -> asyncio.Task:
    """启动后台协程：持强引用 + 结束回收 + 异常落日志（绝不静默）。"""
    task = asyncio.get_running_loop().create_task(coro, name=name)
    _BG_TASKS.add(task)
    if gen_task_id is not None:
        _RUNNING[gen_task_id] = task

    def _done(t: asyncio.Task):
        _BG_TASKS.discard(t)
        if gen_task_id is not None and _RUNNING.get(gen_task_id) is t:
            _RUNNING.pop(gen_task_id, None)
        if not t.cancelled() and t.exception() is not None:
            logger.error("后台任务 %s 异常退出: %s", name, t.exception(), exc_info=t.exception())

    task.add_done_callback(_done)
    return task


def is_runner_alive(gen_task_id: uuid.UUID) -> bool:
    t = _RUNNING.get(gen_task_id)
    return t is not None and not t.done()


# ── 事件流水（SSE 回放数据源，ADR-3）────────────────────────────────

async def emit_event(
    session: AsyncSession,
    task_id: uuid.UUID,
    event_type: str,
    payload: dict | None = None,
) -> int:
    """追加任务事件，返回 seq（自增主键）。payload 保持精简（≤2KB，大对象只放 ID）。"""
    event = TaskEvent(task_id=task_id, event_type=event_type, payload=payload or {})
    session.add(event)
    await session.flush()
    return event.id


async def last_seq(session: AsyncSession, task_id: uuid.UUID) -> int:
    result = await session.execute(
        select(TaskEvent.id).where(TaskEvent.task_id == task_id).order_by(TaskEvent.id.desc()).limit(1)
    )
    row = result.scalar_one_or_none()
    return row or 0


# ── 状态流转 ────────────────────────────────────────────────────────

async def transition(
    session: AsyncSession,
    task: GenerationTask,
    new_status: str,
    *,
    error_message: str | None = None,
) -> int:
    """校验并执行状态流转，同步发 task_state 事件。返回事件 seq。"""
    allowed = ALLOWED_TRANSITIONS.get(task.status, set())
    if new_status not in allowed:
        raise InvalidTransition(task.status, new_status)
    task.status = new_status
    if error_message is not None:
        task.error_message = error_message
    await session.flush()
    payload = {"status": new_status}
    if error_message:
        payload["error_message"] = error_message[:500]
    return await emit_event(session, task.id, "task_state", payload)


# ── 孤儿扫描与看门狗（NFR17）────────────────────────────────────────

ORPHAN_MESSAGE = "服务重启导致任务中断，可从断点继续"
WATCHDOG_MESSAGE = "任务超过 {minutes} 分钟无进展，已由看门狗终止，可从断点继续"


async def recover_orphans() -> int:
    """启动时扫描：活动状态但无对应 runner 的任务 → failed（用户可续跑）。"""
    count = 0
    async with async_session_factory() as session:
        result = await session.execute(
            select(GenerationTask).where(GenerationTask.status.in_(ACTIVE_STATUSES))
        )
        for task in result.scalars().all():
            if is_runner_alive(task.id):
                continue
            try:
                await transition(session, task, "failed", error_message=ORPHAN_MESSAGE)
                count += 1
            except InvalidTransition:  # pragma: no cover — ACTIVE 状态必然允许 failed
                logger.warning("孤儿扫描遇到非法流转: task=%s status=%s", task.id, task.status)
        await session.commit()
    if count:
        logger.warning("孤儿扫描：%d 个中断任务已标记 failed（可续跑）", count)
    return count


async def watchdog_scan_once(now: datetime | None = None) -> int:
    """看门狗单轮：活动状态且 updated_at 超时 → failed。runner 若还挂着则取消。"""
    now = now or datetime.now(timezone.utc)
    deadline = now - WATCHDOG_TIMEOUT
    count = 0
    async with async_session_factory() as session:
        result = await session.execute(
            select(GenerationTask).where(
                GenerationTask.status.in_(ACTIVE_STATUSES),
                GenerationTask.updated_at < deadline,
            )
        )
        for task in result.scalars().all():
            runner = _RUNNING.get(task.id)
            if runner is not None and not runner.done():
                runner.cancel()
            try:
                await transition(
                    session, task, "failed",
                    error_message=WATCHDOG_MESSAGE.format(minutes=int(WATCHDOG_TIMEOUT.total_seconds() // 60)),
                )
                count += 1
            except InvalidTransition:  # pragma: no cover
                logger.warning("看门狗遇到非法流转: task=%s status=%s", task.id, task.status)
        await session.commit()
    if count:
        logger.warning("看门狗：%d 个超时任务已标记 failed", count)
    return count


async def _watchdog_loop():
    while True:
        await asyncio.sleep(WATCHDOG_INTERVAL_SECONDS)
        try:
            await watchdog_scan_once()
        except Exception as e:  # 看门狗自身绝不能死
            logger.error("看门狗扫描异常: %s", e, exc_info=True)


async def _startup_maintenance():
    try:
        await recover_orphans()
    except Exception as e:
        logger.error("孤儿扫描失败: %s", e, exc_info=True)
    await _watchdog_loop()


def start_background_maintenance() -> asyncio.Task:
    """应用 lifespan 启动时调用：孤儿扫描一次，然后常驻看门狗。"""
    return spawn(_startup_maintenance(), name="scenario-gen-maintenance")
