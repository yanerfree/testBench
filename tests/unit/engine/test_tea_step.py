"""Unit 测试 — tea_step.py"""
import json

import pytest

from app.engine.plugins.tea_step import (
    configure_output,
    current_step,
    flush_steps,
    get_steps,
    reset,
    tea_step,
)


class TestTeaStep:

    def setup_method(self):
        reset()

    @pytest.mark.unit
    def test_basic_step(self):
        with tea_step("登录", phase="setup") as step:
            assert step["action"] == "登录"
            assert step["phase"] == "setup"
            assert step["status"] == "passed"
            assert step["requests"] == []

        steps = get_steps()
        assert len(steps) == 1
        assert steps[0]["seq"] == 1
        assert steps[0]["duration_ms"] >= 0
        assert "_start" not in steps[0]

    @pytest.mark.unit
    def test_multiple_steps(self):
        with tea_step("准备数据", phase="setup"):
            pass
        with tea_step("执行操作", phase="action"):
            pass
        with tea_step("验证结果", phase="verify"):
            pass

        steps = get_steps()
        assert len(steps) == 3
        assert [s["phase"] for s in steps] == ["setup", "action", "verify"]
        assert [s["seq"] for s in steps] == [1, 2, 3]

    @pytest.mark.unit
    def test_failed_step(self):
        with pytest.raises(ValueError, match="bad"):
            with tea_step("会失败的步骤", phase="action"):
                raise ValueError("bad")

        steps = get_steps()
        assert len(steps) == 1
        assert steps[0]["status"] == "failed"
        assert steps[0]["error"] == "bad"

    @pytest.mark.unit
    def test_current_step_active(self):
        assert current_step() is None
        with tea_step("当前步骤", phase="action") as step:
            assert current_step() is step
        assert current_step() is None

    @pytest.mark.unit
    def test_current_step_nested(self):
        """嵌套步骤时 current_step 指向最内层"""
        with tea_step("外层", phase="setup") as outer:
            assert current_step() is outer
            with tea_step("内层", phase="action") as inner:
                assert current_step() is inner
            assert current_step() is outer
        assert current_step() is None

    @pytest.mark.unit
    def test_reset(self):
        with tea_step("步骤1", phase="action"):
            pass
        assert len(get_steps()) == 1
        reset()
        assert len(get_steps()) == 0
        assert current_step() is None

    @pytest.mark.unit
    def test_flush_steps(self, tmp_path):
        configure_output(str(tmp_path))

        with tea_step("登录", phase="setup"):
            pass
        with tea_step("创建", phase="action"):
            pass

        flush_steps("TestLogin::test_login")

        out_file = tmp_path / "TestLogin::test_login.json"
        assert out_file.exists()

        data = json.loads(out_file.read_text())
        assert len(data) == 2
        assert data[0]["action"] == "登录"
        assert data[1]["action"] == "创建"

        assert len(get_steps()) == 0

    @pytest.mark.unit
    def test_flush_empty_steps(self, tmp_path):
        configure_output(str(tmp_path))
        flush_steps("empty_test")
        assert not (tmp_path / "empty_test.json").exists()

    @pytest.mark.unit
    def test_step_records_requests(self):
        """模拟 tea_capture 向当前步骤的 requests 列表添加数据"""
        with tea_step("发送请求", phase="action") as step:
            step["requests"].append({
                "method": "POST",
                "url": "/api/login",
                "status_code": 200,
            })

        steps = get_steps()
        assert len(steps[0]["requests"]) == 1
        assert steps[0]["requests"][0]["method"] == "POST"

    @pytest.mark.unit
    def test_default_phase_is_action(self):
        with tea_step("无指定 phase"):
            pass
        assert get_steps()[0]["phase"] == "action"
