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
