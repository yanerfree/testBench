"""API Mock 引擎 — 通用响应生成 + 模板变量"""
from __future__ import annotations

import random
import time
import uuid

from app.services.api_mock_presets import RANDOM_RESPONSES


def resolve_template(template: str, request_body: str | None, method: str, path: str) -> str:
    template = template.replace("${method}", method)
    template = template.replace("${path}", path)
    template = template.replace("${timestamp}", str(int(time.time())))
    template = template.replace("${uuid}", uuid.uuid4().hex)
    template = template.replace("${iso_time}", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    return template


def resolve_body(route: dict, request_body: str | None, method: str, path: str) -> tuple[str, str]:
    mode = route.get("response_mode", "default")
    content_type = route.get("content_type", "application/json")

    if mode == "random":
        entry = random.choice(RANDOM_RESPONSES)
        body = entry["body"]
        content_type = entry.get("content_type", content_type)
    else:
        body = route.get("response_body", "")

    body = resolve_template(body, request_body, method, path)
    return body, content_type


def build_headers(route: dict) -> dict:
    headers = {}
    custom = route.get("response_headers")
    if isinstance(custom, dict):
        headers.update(custom)
    return headers
