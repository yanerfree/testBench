"""API Mock 引擎 — 通用响应生成 + 模板变量"""
from __future__ import annotations

import json
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


def build_echo_response(
    mode: str,
    request_body: str | None,
    method: str,
    path: str,
    request_ctx: dict | None,
) -> tuple[str, str]:
    """回显模式：把收到的请求信息作为响应返回。

    - echo_body: 仅原样返回请求体，Content-Type 跟随请求
    - echo:      返回完整请求信息 (method/path/query/headers/body) 的 JSON
    """
    ctx = request_ctx or {}
    headers = ctx.get("headers") or {}

    if mode == "echo_body":
        body = request_body or ""
        req_ct = headers.get("content-type")
        content_type = req_ct or "text/plain; charset=utf-8"
        return body, content_type

    # mode == "echo": 完整请求回显（httpbin /anything 风格）
    parsed_body: object = request_body
    raw_ct = headers.get("content-type", "")
    if request_body and "json" in raw_ct.lower():
        try:
            parsed_body = json.loads(request_body)
        except (ValueError, TypeError):
            parsed_body = request_body

    echo = {
        "method": method,
        "path": path,
        "query": ctx.get("query") or {},
        "headers": headers,
        "body": parsed_body,
        "ip": ctx.get("client_ip"),
        "timestamp": int(time.time()),
    }
    return json.dumps(echo, ensure_ascii=False, indent=2), "application/json"


def resolve_body(
    route: dict,
    request_body: str | None,
    method: str,
    path: str,
    request_ctx: dict | None = None,
) -> tuple[str, str]:
    mode = route.get("response_mode", "default")
    content_type = route.get("content_type", "application/json")

    if mode in ("echo", "echo_body"):
        return build_echo_response(mode, request_body, method, path, request_ctx)

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
