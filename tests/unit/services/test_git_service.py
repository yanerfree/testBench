"""Unit 测试 — services/git_service.py 纯函数"""
from pathlib import Path

import pytest

from app.services.git_service import get_paths


class TestGetPaths:

    @pytest.mark.unit
    def test_returns_correct_paths(self):
        paths = get_paths("/opt/scripts/proj-a", "release-v2")
        assert paths["base"] == Path("/opt/scripts/proj-a")
        assert paths["bare_repo"] == Path("/opt/scripts/proj-a/.repos/repo.git")
        assert paths["branch_dir"] == Path("/opt/scripts/proj-a/release-v2")
        assert paths["fetch_lock"] == Path("/opt/scripts/proj-a/.repos/repo.git/branch-release-v2.lock")

    @pytest.mark.unit
    def test_different_branches_different_dirs(self):
        p1 = get_paths("/base", "main")
        p2 = get_paths("/base", "develop")
        assert p1["branch_dir"] != p2["branch_dir"]
        assert p1["bare_repo"] == p2["bare_repo"]  # 同项目共享 bare repo

    @pytest.mark.unit
    def test_special_characters_in_branch_name(self):
        paths = get_paths("/base", "feature-123_test")
        assert "feature-123_test" in str(paths["branch_dir"])
