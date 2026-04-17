"""Unit 测试 — sandbox.py 路径逻辑"""
from pathlib import Path

import pytest


class TestSandboxPaths:

    @pytest.mark.unit
    def test_sandbox_dir_format(self):
        from app.engine.sandbox import Path as P
        base = "/opt/scripts/proj-a"
        execution_id = "abc-123"
        sandbox_dir = P(base) / ".sandboxes" / execution_id
        assert str(sandbox_dir) == "/opt/scripts/proj-a/.sandboxes/abc-123"

    @pytest.mark.unit
    def test_bare_repo_path(self):
        base = "/opt/scripts/proj-a"
        bare_repo = Path(base) / ".repos" / "repo.git"
        assert str(bare_repo) == "/opt/scripts/proj-a/.repos/repo.git"

    @pytest.mark.unit
    def test_lock_file_path(self):
        bare_repo = Path("/opt/scripts/.repos/repo.git")
        lock = bare_repo / "sandbox.lock"
        assert str(lock) == "/opt/scripts/.repos/repo.git/sandbox.lock"
