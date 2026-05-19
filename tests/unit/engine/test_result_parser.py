"""Unit 测试 — result_parser.py"""
import json
import os
import tempfile

import pytest

from app.engine.result_parser import parse_junit_xml, parse_step_json


class TestParseJunitXml:

    @pytest.mark.unit
    def test_parse_passed(self, tmp_path):
        xml = """<?xml version="1.0"?>
        <testsuite tests="1">
            <testcase name="test_login" time="1.23"/>
        </testsuite>"""
        path = tmp_path / "result.xml"
        path.write_text(xml)

        results = parse_junit_xml(str(path))
        assert len(results) == 1
        assert results[0]["name"] == "test_login"
        assert results[0]["status"] == "passed"
        assert results[0]["duration_s"] == 1.23
        assert results[0]["message"] is None

    @pytest.mark.unit
    def test_parse_failed(self, tmp_path):
        xml = """<?xml version="1.0"?>
        <testsuite tests="1">
            <testcase name="test_bad" time="0.5">
                <failure message="assert 1 == 2"/>
            </testcase>
        </testsuite>"""
        path = tmp_path / "result.xml"
        path.write_text(xml)

        results = parse_junit_xml(str(path))
        assert results[0]["status"] == "failed"
        assert "1 == 2" in results[0]["message"]

    @pytest.mark.unit
    def test_parse_error(self, tmp_path):
        xml = """<?xml version="1.0"?>
        <testsuite>
            <testcase name="test_err" time="0.1">
                <error message="ImportError"/>
            </testcase>
        </testsuite>"""
        path = tmp_path / "result.xml"
        path.write_text(xml)

        results = parse_junit_xml(str(path))
        assert results[0]["status"] == "error"

    @pytest.mark.unit
    def test_parse_skipped(self, tmp_path):
        xml = """<?xml version="1.0"?>
        <testsuite>
            <testcase name="test_skip" time="0">
                <skipped message="not applicable"/>
            </testcase>
        </testsuite>"""
        path = tmp_path / "result.xml"
        path.write_text(xml)

        results = parse_junit_xml(str(path))
        assert results[0]["status"] == "skipped"

    @pytest.mark.unit
    def test_file_not_found(self):
        results = parse_junit_xml("/nonexistent/file.xml")
        assert results == []

    @pytest.mark.unit
    def test_multiple_cases(self, tmp_path):
        xml = """<?xml version="1.0"?>
        <testsuite tests="3">
            <testcase name="t1" time="0.1"/>
            <testcase name="t2" time="0.2"><failure message="fail"/></testcase>
            <testcase name="t3" time="0.3"/>
        </testsuite>"""
        path = tmp_path / "result.xml"
        path.write_text(xml)

        results = parse_junit_xml(str(path))
        assert len(results) == 3
        assert results[0]["status"] == "passed"
        assert results[1]["status"] == "failed"
        assert results[2]["status"] == "passed"


class TestParseStepJson:

    @pytest.mark.unit
    def test_parse_steps(self, tmp_path):
        data = [
            {"step": "POST /api/login", "status": "passed", "duration_ms": 120, "method": "POST", "url": "/api/login", "status_code": 200},
            {"step": "Assert token", "status": "passed", "duration_ms": 5},
        ]
        path = tmp_path / "steps.json"
        path.write_text(json.dumps(data))

        steps = parse_step_json(str(path))
        assert len(steps) == 2
        assert steps[0]["step_name"] == "POST /api/login"
        assert steps[0]["http_method"] == "POST"
        assert steps[0]["status_code"] == 200
        assert steps[1]["step_name"] == "Assert token"

    @pytest.mark.unit
    def test_file_not_found(self):
        assert parse_step_json("/nonexistent.json") == []

    @pytest.mark.unit
    def test_invalid_json(self, tmp_path):
        path = tmp_path / "bad.json"
        path.write_text("not json")
        assert parse_step_json(str(path)) == []

    @pytest.mark.unit
    def test_parse_tea_step_format(self, tmp_path):
        """tea_step 嵌套格式: action + phase + requests"""
        data = [
            {
                "seq": 1,
                "action": "管理员登录",
                "phase": "setup",
                "status": "passed",
                "duration_ms": 120,
                "requests": [
                    {
                        "method": "POST",
                        "url": "http://localhost/api/auth/login",
                        "status_code": 200,
                        "status": "passed",
                        "duration_ms": 100,
                        "request": {"headers": {}, "body": {"username": "admin"}},
                        "response": {"headers": {}, "body": {"token": "xxx"}},
                    }
                ],
            },
            {
                "seq": 2,
                "action": "创建项目",
                "phase": "action",
                "status": "passed",
                "duration_ms": 80,
                "requests": [],
            },
            {
                "seq": 3,
                "action": "验证返回 201",
                "phase": "verify",
                "status": "failed",
                "duration_ms": 5,
                "error": "AssertionError: 400 != 201",
                "requests": [],
            },
        ]
        path = tmp_path / "test_fn.json"
        path.write_text(json.dumps(data))

        steps = parse_step_json(str(path))
        assert len(steps) == 3

        assert steps[0]["step_name"] == "管理员登录"
        assert steps[0]["step_label"] == "管理员登录"
        assert steps[0]["step_phase"] == "setup"
        assert steps[0]["http_method"] == "POST"
        assert steps[0]["url"] == "http://localhost/api/auth/login"
        assert steps[0]["status_code"] == 200

        assert steps[1]["step_name"] == "创建项目"
        assert steps[1]["step_phase"] == "action"
        assert steps[1]["http_method"] is None

        assert steps[2]["step_name"] == "验证返回 201"
        assert steps[2]["step_phase"] == "verify"
        assert steps[2]["status"] == "failed"
        assert steps[2]["error_summary"] == "AssertionError: 400 != 201"

    @pytest.mark.unit
    def test_parse_http_capture_format_preserved(self, tmp_path):
        """原有 HTTP 级平铺格式（向后兼容）"""
        data = [
            {
                "step": "POST /api/login",
                "method": "POST",
                "url": "/api/login",
                "status_code": 200,
                "status": "passed",
                "duration_ms": 100,
                "request": {"headers": {}, "body": {}},
                "response": {"headers": {}, "body": {}},
                "assertions": [{"passed": True, "description": "ok"}],
            }
        ]
        path = tmp_path / "capture.json"
        path.write_text(json.dumps(data))

        steps = parse_step_json(str(path))
        assert len(steps) == 1
        assert steps[0]["step_name"] == "POST /api/login"
        assert steps[0]["step_label"] is None
        assert steps[0]["step_phase"] is None
        assert steps[0]["http_method"] == "POST"

    @pytest.mark.unit
    def test_tea_step_multi_request(self, tmp_path):
        """一个 tea_step 包含多个 HTTP 请求时取第一个"""
        data = [
            {
                "action": "批量创建用户",
                "phase": "setup",
                "status": "passed",
                "duration_ms": 500,
                "requests": [
                    {"method": "POST", "url": "/api/users", "status_code": 201, "status": "passed", "duration_ms": 200, "request": {}, "response": {}},
                    {"method": "POST", "url": "/api/users", "status_code": 201, "status": "passed", "duration_ms": 200, "request": {}, "response": {}},
                ],
            }
        ]
        path = tmp_path / "multi.json"
        path.write_text(json.dumps(data))

        steps = parse_step_json(str(path))
        assert len(steps) == 1
        assert steps[0]["http_method"] == "POST"
        assert steps[0]["url"] == "/api/users"
        assert steps[0]["requests"] is not None
        assert len(steps[0]["requests"]) == 2
