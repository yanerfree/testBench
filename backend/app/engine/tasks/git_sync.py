"""
Git 同步异步任务 — 在 arq Worker 中执行。

调用链: API → arq.enqueue_job → Worker 执行本函数 → 更新 DB + Redis 状态
"""
import logging
import uuid
from datetime import datetime, timezone

import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.engine.task_status import set_task_status
from app.models.project import Branch, Project
from app.services.git_service import GitError, sync_branch

logger = logging.getLogger(__name__)


async def run_git_sync(ctx: dict, task_id: str, branch_id: str, project_id: str) -> dict:
    """
    arq 任务: 执行 Git 同步。

    在 Worker 进程中运行，通过 anyio.to_thread 包装 subprocess 调用。
    """
    await set_task_status(task_id, "running", message="正在同步 Git 仓库...")

    # Worker 需要自己创建 DB session（不共享 API 进程的连接池）
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as session:
            # 1. 加载 branch + project
            result = await session.execute(
                select(Branch).where(Branch.id == uuid.UUID(branch_id))
            )
            branch = result.scalar_one_or_none()
            if branch is None:
                await set_task_status(task_id, "failed", message="分支配置不存在")
                return {"error": "branch not found"}

            result = await session.execute(
                select(Project).where(Project.id == uuid.UUID(project_id))
            )
            project = result.scalar_one_or_none()
            if project is None:
                await set_task_status(task_id, "failed", message="项目不存在")
                return {"error": "project not found"}

            # 2. 执行 Git 同步（在线程中）
            old_sha = branch.last_commit_sha
            try:
                sync_result = await anyio.to_thread.run_sync(
                    lambda: sync_branch(
                        git_url=project.git_url,
                        script_base_path=project.script_base_path,
                        branch_name=branch.name,
                        git_branch=branch.branch,
                        old_commit_sha=old_sha,
                    )
                )
            except GitError as e:
                logger.error("Git sync failed for branch %s: %s", branch_id, e.message)
                await set_task_status(task_id, "failed", message=e.message)
                return {"error": e.message}

            # 3. 更新 branch 记录
            branch.last_commit_sha = sync_result["commit_sha"]
            branch.last_sync_at = datetime.now(timezone.utc)
            await session.commit()

            # 4. 报告成功
            result_data = {
                "commitSha": sync_result["commit_sha"],
                "firstTime": sync_result["first_time"],
                "added": sync_result["diff"]["added"],
                "modified": sync_result["diff"]["modified"],
                "deleted": sync_result["diff"]["deleted"],
            }
            await set_task_status(task_id, "completed", message="同步完成", result=result_data)
            logger.info("Git sync completed for branch %s: %s", branch_id, sync_result["commit_sha"])
            return result_data

    except Exception as e:
        logger.exception("Unexpected error in git sync task")
        await set_task_status(task_id, "failed", message=f"同步异常: {str(e)}")
        return {"error": str(e)}
    finally:
        await engine.dispose()
