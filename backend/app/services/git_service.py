"""
Git 服务 — bare clone / fetch / worktree 操作。

三层目录模型:
  {script_base_path}/.repos/repo.git     — bare 仓库（项目级唯一）
  {script_base_path}/{branch_name}/      — 分支配置工作目录 (worktree)
  {script_base_path}/.sandboxes/{id}/    — 执行沙箱（临时，Story 4.2 实现）

并发安全:
  - fetch 操作使用 FileLock 串行化
  - 不同分支配置的 checkout 可并行
"""
import logging
import subprocess
from pathlib import Path

from filelock import FileLock

logger = logging.getLogger(__name__)


class GitError(Exception):
    """Git 操作失败。"""

    def __init__(self, message: str, stderr: str = ""):
        self.message = message
        self.stderr = stderr
        super().__init__(message)


def _run_git(args: list[str], cwd: str | None = None, timeout: int = 120) -> str:
    """执行 git 命令，返回 stdout。失败抛出 GitError。"""
    cmd = ["git"] + args
    logger.info("git command: %s (cwd=%s)", " ".join(cmd), cwd)
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise GitError(f"Git 操作超时（{timeout}s）", stderr="timeout")
    except FileNotFoundError:
        raise GitError("Git 未安装或不在 PATH 中", stderr="git not found")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        # 提供用户友好的错误信息
        if "Authentication" in stderr or "Permission denied" in stderr:
            raise GitError("Git 认证失败，请检查服务器 SSH 配置", stderr=stderr)
        if "Could not resolve hostname" in stderr or "unable to access" in stderr:
            raise GitError("Git 仓库地址无法访问，请检查网络连接", stderr=stderr)
        if "not a git repository" in stderr:
            raise GitError("目标路径不是有效的 Git 仓库", stderr=stderr)
        raise GitError(f"Git 操作失败: {stderr}", stderr=stderr)

    return result.stdout.strip()


def get_paths(script_base_path: str, branch_name: str) -> dict[str, Path]:
    """根据项目配置和分支名称，计算三层目录路径。"""
    base = Path(script_base_path)
    bare_repo = base / ".repos" / "repo.git"
    return {
        "base": base,
        "bare_repo": bare_repo,
        "branch_dir": base / branch_name,
        "fetch_lock": bare_repo / f"branch-{branch_name}.lock",
    }


def ensure_bare_repo(git_url: str, bare_repo: Path, timeout: int = 300) -> bool:
    """确保 bare 仓库存在且 fetch refspec 正确。返回 True 表示新建，False 表示已存在。"""
    first_time = False
    if not (bare_repo / "HEAD").exists():
        bare_repo.parent.mkdir(parents=True, exist_ok=True)
        _run_git(
            ["clone", "--bare", git_url, str(bare_repo)],
            timeout=timeout,
        )
        logger.info("bare repo cloned: %s", bare_repo)
        first_time = True

    _run_git(
        ["--git-dir", str(bare_repo), "config", "remote.origin.fetch",
         "+refs/heads/*:refs/remotes/origin/*"],
    )
    return first_time


def fetch_origin(bare_repo: Path, lock_path: Path, timeout: int = 120) -> None:
    """fetch origin --prune，使用 FileLock 串行化。"""
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = FileLock(str(lock_path), timeout=60)
    with lock:
        _run_git(
            ["--git-dir", str(bare_repo), "fetch", "origin", "--prune"],
            timeout=timeout,
        )
    logger.info("fetch completed: %s", bare_repo)


def sync_branch_first_time(bare_repo: Path, branch_dir: Path, git_branch: str) -> str:
    """首次同步：worktree add。返回 commit SHA。"""
    branch_dir.parent.mkdir(parents=True, exist_ok=True)
    _run_git([
        "--git-dir", str(bare_repo),
        "worktree", "add",
        str(branch_dir),
        f"origin/{git_branch}",
    ])
    sha = _run_git(["rev-parse", "HEAD"], cwd=str(branch_dir))
    logger.info("worktree created: %s @ %s", branch_dir, sha)
    return sha


def sync_branch_update(branch_dir: Path, git_branch: str) -> str:
    """后续同步：丢弃本地改动后 checkout detached HEAD。返回 commit SHA。"""
    _run_git(["checkout", "--", "."], cwd=str(branch_dir))
    _run_git(["clean", "-fd"], cwd=str(branch_dir))
    _run_git(
        ["checkout", f"origin/{git_branch}"],
        cwd=str(branch_dir),
    )
    sha = _run_git(["rev-parse", "HEAD"], cwd=str(branch_dir))
    logger.info("branch updated: %s @ %s", branch_dir, sha)
    return sha


def get_diff_summary(branch_dir: Path, old_sha: str | None, new_sha: str) -> dict:
    """获取两个 commit 之间的变更统计。"""
    if old_sha is None or old_sha == new_sha:
        return {"added": 0, "modified": 0, "deleted": 0}

    try:
        output = _run_git(
            ["diff", "--stat", "--numstat", old_sha, new_sha],
            cwd=str(branch_dir),
        )
    except GitError:
        return {"added": 0, "modified": 0, "deleted": 0}

    added = modified = deleted = 0
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            ins, dels, _ = parts
            if ins == "-":
                continue
            ins_count = int(ins) if ins.isdigit() else 0
            dels_count = int(dels) if dels.isdigit() else 0
            if dels_count == 0 and ins_count > 0:
                added += 1
            elif ins_count == 0 and dels_count > 0:
                deleted += 1
            else:
                modified += 1

    return {"added": added, "modified": modified, "deleted": deleted}


def sync_branch(
    git_url: str,
    script_base_path: str,
    branch_name: str,
    git_branch: str,
    old_commit_sha: str | None = None,
) -> dict:
    """
    完整的分支同步流程（同步执行）。

    返回: {"commit_sha": str, "first_time": bool, "diff": {...}}
    """
    paths = get_paths(script_base_path, branch_name)

    # 1. 确保 bare repo 存在
    ensure_bare_repo(git_url, paths["bare_repo"])

    # 2. fetch
    fetch_origin(paths["bare_repo"], paths["fetch_lock"])

    # 3. checkout
    first_time = not paths["branch_dir"].exists()
    if first_time:
        commit_sha = sync_branch_first_time(
            paths["bare_repo"], paths["branch_dir"], git_branch
        )
    else:
        commit_sha = sync_branch_update(paths["branch_dir"], git_branch)

    # 4. diff summary
    diff = get_diff_summary(paths["branch_dir"], old_commit_sha, commit_sha)

    return {
        "commit_sha": commit_sha,
        "first_time": first_time,
        "diff": diff,
    }
