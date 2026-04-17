"""健康检查端点 — /healthz (存活探针) + /readyz (就绪探针)"""
import shutil

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/api/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/api/readyz")
async def readyz():
    """
    就绪探针 — 检查各组件状态。

    检查项: db, redis, disk
    全部 ok → 200, 任一 error → 503
    """
    components = {}

    # 1. 数据库
    try:
        engine = create_async_engine(settings.database_url, echo=False)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        components["db"] = "ok"
    except Exception:
        components["db"] = "error"

    # 2. Redis
    try:
        from redis.asyncio import Redis
        r = Redis.from_url(settings.redis_url, decode_responses=True)
        await r.ping()
        await r.aclose()
        components["redis"] = "ok"
    except Exception:
        components["redis"] = "error"

    # 3. 磁盘空间 (阈值 500MB)
    try:
        disk = shutil.disk_usage("/")
        free_mb = disk.free / (1024 * 1024)
        components["disk"] = "ok" if free_mb > 500 else "error"
    except Exception:
        components["disk"] = "error"

    overall = "ok" if all(v == "ok" for v in components.values()) else "degraded"
    status_code = 200 if overall == "ok" else 503

    from starlette.responses import JSONResponse
    return JSONResponse(
        status_code=status_code,
        content={"status": overall, "components": components},
    )
