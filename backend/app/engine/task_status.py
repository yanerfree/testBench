"""
任务状态管理 — 使用 Redis 存储异步任务进度和结果。

状态流转: pending → running → completed / failed
TTL: 1 小时（完成后自动过期）
"""
import json

from redis.asyncio import Redis

from app.config import settings

_TASK_PREFIX = "task:"
_TASK_TTL = 3600  # 1 小时


async def _get_redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


async def set_task_status(
    task_id: str,
    status: str,
    message: str = "",
    result: dict | None = None,
) -> None:
    """写入/更新任务状态。"""
    r = await _get_redis()
    try:
        data = {
            "status": status,
            "message": message,
            "result": json.dumps(result) if result else None,
        }
        await r.hset(f"{_TASK_PREFIX}{task_id}", mapping=data)
        await r.expire(f"{_TASK_PREFIX}{task_id}", _TASK_TTL)
    finally:
        await r.aclose()


async def get_task_status(task_id: str) -> dict | None:
    """读取任务状态。返回 None 表示任务不存在或已过期。"""
    r = await _get_redis()
    try:
        data = await r.hgetall(f"{_TASK_PREFIX}{task_id}")
        if not data:
            return None
        result_str = data.get("result")
        return {
            "taskId": task_id,
            "status": data.get("status", "unknown"),
            "message": data.get("message", ""),
            "result": json.loads(result_str) if result_str else None,
        }
    finally:
        await r.aclose()
