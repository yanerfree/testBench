"""
沙箱管理 — Git worktree 隔离执行环境。

沙箱目录: {script_base_path}/.sandboxes/{execution_id}/
基于 commit SHA 创建 detached HEAD worktree，确保执行期间代码不变。
"""
import logging
import shutil
from pathlib import Path

from filelock import FileLock

from app.services.git_service import GitError, _run_git

logger = logging.getLogger(__name__)


def create_sandbox(bare_repo: Path, sandbox_dir: Path, commit_sha: str) -> None:
    """创建执行沙箱 (git worktree add --detach)。使用 FileLock 串行化。"""
    lock_path = bare_repo / "sandbox.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = FileLock(str(lock_path), timeout=60)

    with lock:
        sandbox_dir.parent.mkdir(parents=True, exist_ok=True)
        _run_git([
            "--git-dir", str(bare_repo),
            "worktree", "add", "--detach",
            str(sandbox_dir), commit_sha,
        ])
    logger.info("sandbox created: %s @ %s", sandbox_dir, commit_sha)


def cleanup_sandbox(bare_repo: Path, sandbox_dir: Path) -> None:
    """清理沙箱。先尝试 git worktree remove，失败则 rm -rf 兜底。"""
    if not sandbox_dir.exists():
        return

    try:
        _run_git([
            "--git-dir", str(bare_repo),
            "worktree", "remove", "--force", str(sandbox_dir),
        ])
        logger.info("sandbox removed via git: %s", sandbox_dir)
    except GitError:
        logger.warning("git worktree remove failed, falling back to rm -rf: %s", sandbox_dir)
        shutil.rmtree(str(sandbox_dir), ignore_errors=True)
        try:
            _run_git(["--git-dir", str(bare_repo), "worktree", "prune"])
        except GitError:
            pass
        logger.info("sandbox removed via rm -rf: %s", sandbox_dir)


def cleanup_orphans(script_base_path: str) -> int:
    """Worker 启动时扫描 .sandboxes/ 清理残留目录。返回清理数量。"""
    sandboxes_dir = Path(script_base_path) / ".sandboxes"
    if not sandboxes_dir.exists():
        return 0

    bare_repo = Path(script_base_path) / ".repos" / "repo.git"
    cleaned = 0
    for child in sandboxes_dir.iterdir():
        if child.is_dir():
            cleanup_sandbox(bare_repo, child)
            cleaned += 1

    if cleaned > 0 and bare_repo.exists():
        try:
            _run_git(["--git-dir", str(bare_repo), "worktree", "prune"])
        except GitError:
            pass

    logger.info("cleaned %d orphan sandboxes in %s", cleaned, sandboxes_dir)
    return cleaned
