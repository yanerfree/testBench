"""
arq WorkerSettings — Worker 进程入口。

启动命令: arq app.engine.worker.WorkerSettings
"""
from arq.connections import RedisSettings

from app.deps.worker import get_redis_settings
from app.engine.tasks.git_sync import run_git_sync
from app.engine.tasks.execution import run_automated_execution


class WorkerSettings:
    """arq Worker 配置。"""
    functions = [run_git_sync, run_automated_execution]
    redis_settings: RedisSettings = get_redis_settings()
    max_jobs = 6
    job_timeout = 600
