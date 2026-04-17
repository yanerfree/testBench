"""Unit 测试 — command_builder.py"""
import pytest

from app.engine.command_builder import build_pytest_command, check_script_exists


class TestBuildPytestCommand:

    @pytest.mark.unit
    def test_basic_command(self):
        cmd = build_pytest_command("/sandbox", "tests/test_login.py")
        assert cmd[0] == "pytest"
        assert "/sandbox/tests/test_login.py" in cmd[1]
        assert "--tb=short" in cmd

    @pytest.mark.unit
    def test_with_function(self):
        cmd = build_pytest_command("/sandbox", "tests/test_login.py", script_ref_func="test_success")
        assert "/sandbox/tests/test_login.py::test_success" in cmd[1]

    @pytest.mark.unit
    def test_with_junit_xml(self):
        cmd = build_pytest_command("/sandbox", "tests/t.py", junit_xml_path="/tmp/result.xml")
        assert "--junit-xml=/tmp/result.xml" in cmd

    @pytest.mark.unit
    def test_with_timeout(self):
        cmd = build_pytest_command("/sandbox", "tests/t.py", timeout=60)
        assert "--timeout=60" in cmd

    @pytest.mark.unit
    def test_no_function_no_double_colon(self):
        cmd = build_pytest_command("/sandbox", "tests/t.py")
        assert "::" not in cmd[1]
