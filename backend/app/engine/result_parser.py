"""解析 pytest 执行结果 — JUnit XML + 步骤级 JSON。"""
import json
import logging
import xml.etree.ElementTree as ET
from pathlib import Path

logger = logging.getLogger(__name__)


def parse_junit_xml(xml_path: str) -> list[dict]:
    """
    解析 JUnit XML 文件。

    返回: [{"name": str, "status": "passed"|"failed"|"error", "duration_s": float, "message": str|None}]
    """
    results = []
    path = Path(xml_path)
    if not path.exists():
        logger.warning("JUnit XML not found: %s", xml_path)
        return results

    try:
        tree = ET.parse(str(path))
        root = tree.getroot()

        for testcase in root.iter("testcase"):
            name = testcase.get("name", "unknown")
            duration = float(testcase.get("time", "0"))

            failure = testcase.find("failure")
            error = testcase.find("error")
            skipped = testcase.find("skipped")

            if failure is not None:
                status = "failed"
                message = failure.get("message", "") or failure.text or ""
            elif error is not None:
                status = "error"
                message = error.get("message", "") or error.text or ""
            elif skipped is not None:
                status = "skipped"
                message = skipped.get("message", "")
            else:
                status = "passed"
                message = None

            results.append({
                "name": name,
                "status": status,
                "duration_s": duration,
                "message": message[:2000] if message else None,
            })
    except ET.ParseError:
        logger.exception("Failed to parse JUnit XML: %s", xml_path)

    return results


def parse_step_json(json_path: str) -> list[dict]:
    """
    解析步骤级 JSON 文件（TEA 格式）。

    返回: [{"step_name", "status", "duration_ms", "http_method", "url",
            "status_code", "request_data", "response_data", "assertions", "error_summary"}]
    """
    path = Path(json_path)
    if not path.exists():
        return []

    try:
        with open(path) as f:
            data = json.load(f)

        if not isinstance(data, list):
            data = [data]

        steps = []
        for i, step in enumerate(data):
            steps.append({
                "step_name": step.get("step", step.get("name", f"Step {i+1}")),
                "status": step.get("status", "passed"),
                "duration_ms": step.get("duration_ms", step.get("durationMs")),
                "http_method": step.get("method", step.get("http_method")),
                "url": step.get("url"),
                "status_code": step.get("status_code", step.get("statusCode")),
                "request_data": step.get("request"),
                "response_data": step.get("response"),
                "assertions": step.get("assertions"),
                "error_summary": step.get("error", step.get("error_summary")),
            })
        return steps
    except (json.JSONDecodeError, KeyError):
        logger.exception("Failed to parse step JSON: %s", json_path)
        return []
