"""arq Worker 连接池依赖注入。"""
from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from app.config import settings

_pool: ArqRedis | None = None


def _parse_redis_settings() -> RedisSettings:
    """从 redis_url 解析出 arq RedisSettings。"""
    from urllib.parse import urlparse
    parsed = urlparse(settings.redis_url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=int(parsed.path.lstrip("/") or 0),
        password=parsed.password,
    )


def get_redis_settings() -> RedisSettings:
    return _parse_redis_settings()


async def get_arq_pool() -> ArqRedis:
    """获取 arq 连接池（单例）。"""
    global _pool
    if _pool is None:
        _pool = await create_pool(get_redis_settings())
    return _pool


async def close_arq_pool() -> None:
    """关闭连接池（应用关闭时调用）。"""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
