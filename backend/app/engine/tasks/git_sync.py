"""
Git 同步 + 用例导入任务。

完整链路:
  1. git clone/fetch/checkout → 代码落盘到 {script_base_path}/{branch_name}/
  2. 读取 {branch_name}/{json_file_path}（默认 tea-cases.json）
  3. 调用 import_service.import_cases() 将用例写入 DB
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import anyio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.engine.task_status import set_task_status
from app.models.project import Branch, Project
from app.services.git_service import GitError, sync_branch
from app.services import import_service

logger = logging.getLogger(__name__)


async def run_git_sync(ctx: dict, task_id: str, branch_id: str, project_id: str) -> dict:
    """arq 任务入口（保留兼容性）。"""
    return await run_git_sync_inline(task_id, branch_id, project_id)


async def run_git_sync_inline(task_id: str, branch_id: str, project_id: str) -> dict:
    """
    Git 同步 + 用例导入 — 可由 BackgroundTasks 或 arq Worker 调用。
    """
    await set_task_status(task_id, "running", message="正在同步 Git 仓库...")

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
            await set_task_status(task_id, "running", message="正在拉取代码...")
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

            # 3. 更新 branch 的 commit 记录
            branch.last_commit_sha = sync_result["commit_sha"]
            branch.last_sync_at = datetime.now(timezone.utc)

            # 4. 读取 tea-cases.json 并导入用例；无 JSON 时扫描脚本目录
            import_summary = None
            import_source = None
            repo_dir = Path(project.script_base_path) / branch.name
            json_file = repo_dir / branch.json_file_path
            if json_file.exists():
                import_source = "json"
                await set_task_status(task_id, "running", message="正在从 tea-cases.json 导入用例...")
                try:
                    raw = await anyio.to_thread.run_sync(lambda: json_file.read_text(encoding="utf-8"))
                    data = json.loads(raw)
                    cases_list = data.get("cases", [])
                    cases_list = [c for c in cases_list if c.get("type") in ("api", "e2e")]
                    if cases_list:
                        import_summary = await import_service.import_cases(session, branch.id, cases_list)
                        logger.info("Import from JSON completed: %s", import_summary)
                except json.JSONDecodeError as e:
                    logger.warning("Failed to parse %s: %s", json_file, e)
                    import_summary = {"error": f"JSON 解析失败: {e}"}
                except Exception as e:
                    logger.warning("Failed to import cases from %s: %s", json_file, e)
                    import_summary = {"error": str(e)}
            else:
                import_source = "scan"
                await set_task_status(task_id, "running", message="未找到 tea-cases.json，正在扫描测试脚本...")
                try:
                    from app.services.script_scanner import scan_test_scripts
                    cases_list = await anyio.to_thread.run_sync(lambda: scan_test_scripts(repo_dir))
                    if cases_list:
                        import_summary = await import_service.import_cases(session, branch.id, cases_list)
                        logger.info("Import from scan completed: %s", import_summary)
                    else:
                        logger.info("No test scripts found in %s", repo_dir)
                except Exception as e:
                    logger.warning("Failed to scan test scripts in %s: %s", repo_dir, e)
                    import_summary = {"error": str(e)}

            await session.commit()

            # 5. 报告成功
            result_data = {
                "commitSha": sync_result["commit_sha"],
                "firstTime": sync_result["first_time"],
                "diff": sync_result["diff"],
                "import": import_summary,
                "importSource": import_source,
            }
            msg = "同步完成"
            if import_summary and not import_summary.get("error"):
                source_label = "JSON" if import_source == "json" else "脚本扫描"
                msg += f"（{source_label}），导入 {import_summary.get('new', 0)} 新增 / {import_summary.get('updated', 0)} 更新"
            elif import_source == "scan" and not import_summary:
                msg += "（未扫描到测试用例）"

            await set_task_status(task_id, "completed", message=msg, result=result_data)
            from app.core.audit import write_audit_log
            await write_audit_log(session, action="sync", target_type="branch", target_id=branch.id, target_name=branch.name, changes=result_data)
            logger.info("Git sync + import completed for branch %s", branch_id)
            return result_data

    except Exception as e:
        logger.exception("Unexpected error in git sync task")
        await set_task_status(task_id, "failed", message=f"同步异常: {str(e)}")
        return {"error": str(e)}
    finally:
        await engine.dispose()
