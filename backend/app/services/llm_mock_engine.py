"""LLM Mock 引擎 — 路由匹配 + 响应生成 + SSE 流式 + Token 估算"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
import string
import random
from typing import AsyncIterator


RANDOM_RESPONSES: list[str] = [
    "你好！有什么我可以帮助你的吗？",
    "好的，我来帮你处理这个问题。请稍等片刻。",
    "根据我的分析，这个方案是可行的。建议你按照以下步骤操作：首先确认需求，然后制定计划，最后逐步执行。",
    "这是一个很好的问题。简单来说，这个概念的核心在于通过抽象化来降低系统复杂度，同时保持足够的灵活性。",
    "感谢你的提问！以下是我的建议：\n\n1. 先明确目标和约束条件\n2. 评估现有资源和可用方案\n3. 选择最优方案并制定实施计划\n4. 执行并持续监控效果",
    "I'd be happy to help you with that. Based on the information provided, here's my analysis and recommendation.",
    "让我来总结一下要点：\n- 第一，数据完整性需要保障\n- 第二，性能指标要满足 SLA 要求\n- 第三，安全合规是底线\n\n如果还有其他问题，随时可以问我。",
    "这个问题涉及多个方面。从技术角度看，推荐使用微服务架构来解耦各模块；从业务角度看，需要优先保证核心流程的稳定性。",
    "当然可以！这里是一个示例代码：\n\n```python\ndef hello(name):\n    return f\"Hello, {name}!\"\n\nresult = hello(\"World\")\nprint(result)\n```\n\n希望这对你有帮助。",
    "经过仔细分析，我认为有以下几个关键因素需要考虑：响应时间、吞吐量、错误率和资源利用率。建议从这几个维度建立监控体系。",
    "你好，这个任务我已经理解了。预计需要以下资源和时间来完成。如果有任何调整，请随时告知。",
    "这是一个常见的场景。通常的做法是先进行充分的测试，然后灰度发布，观察一段时间后再全量上线。",
    "非常抱歉，我无法直接执行这个操作，但我可以为你提供详细的操作指南和注意事项。",
    "好的，让我换一种方式来解释：想象一下你在整理一个大型图书馆——你需要先建立分类体系，然后按类别整理，最后建立索引方便查找。软件架构设计也是类似的道理。",
    "处理完成！结果显示一切正常，所有测试用例均已通过。详细报告如下...",
]


def _gen_completion_id() -> str:
    chars = string.ascii_letters + string.digits
    suffix = "".join(random.choices(chars, k=29))
    return f"chatcmpl-{suffix}"


def _gen_call_id() -> str:
    chars = string.ascii_letters + string.digits
    suffix = "".join(random.choices(chars, k=24))
    return f"call_{suffix}"


def _gen_request_id() -> str:
    return f"req_{uuid.uuid4().hex[:24]}"


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    non_ascii = len(text) - ascii_chars
    return max(1, int(ascii_chars / 4 + non_ascii / 1.5))


def _resolve_template(template: str, request_body: dict) -> str:
    model = request_body.get("model", "gpt-4o")
    template = template.replace("${request.model}", model)
    messages = request_body.get("messages", [])
    if messages:
        last_content = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                c = m.get("content", "")
                last_content = c if isinstance(c, str) else str(c)
                break
        template = template.replace("${request.messages[-1].content}", last_content)
        template = template.replace("${request.messages.length}", str(len(messages)))
    template = template.replace("${random.uuid}", uuid.uuid4().hex)
    template = template.replace("${timestamp}", str(int(time.time())))
    return template


_ERROR_MAP: dict[int, tuple[str, str | None]] = {
    400: ("invalid_request_error", "invalid_request"),
    401: ("invalid_request_error", "invalid_api_key"),
    403: ("insufficient_quota", "insufficient_quota"),
    404: ("invalid_request_error", "model_not_found"),
    408: ("timeout", "request_timeout"),
    429: ("requests", "rate_limit_exceeded"),
}


def _error_meta(status_code: int) -> tuple[str, str | None]:
    return _ERROR_MAP.get(status_code, ("server_error", "server_error" if status_code >= 500 else None))


_AI_CASE_KEYWORDS = ("测试用例", "JSON 数组", "test case", "测试设计", "设计测试用例")

_MOCK_CASES_JSON = json.dumps([
    {
        "title": "正常创建-必填字段完整",
        "type": "api",
        "priority": "P0",
        "preconditions": "已登录，具有创建权限",
        "steps": [
            {"action": "发送 POST 请求，body 包含所有必填字段", "expected": "返回 201，响应包含新建资源的 id"},
            {"action": "查询新建资源详情", "expected": "返回 200，数据与提交一致"}
        ],
        "expected_result": "资源创建成功，数据完整",
        "module": "${request.model}",
        "submodule": None,
        "tags": ["正向", "CRUD"]
    },
    {
        "title": "异常-缺少必填字段",
        "type": "api",
        "priority": "P0",
        "preconditions": "已登录",
        "steps": [
            {"action": "发送 POST 请求，body 缺少必填字段", "expected": "返回 400/422，提示缺少必填字段"}
        ],
        "expected_result": "拒绝创建，返回明确的错误提示",
        "module": "${request.model}",
        "submodule": None,
        "tags": ["异常", "参数校验"]
    },
    {
        "title": "异常-重复数据唯一性校验",
        "type": "api",
        "priority": "P0",
        "preconditions": "数据库中已存在相同唯一键的记录",
        "steps": [
            {"action": "发送 POST 请求，body 包含已存在的唯一键值", "expected": "返回 409 或 400，提示数据重复"}
        ],
        "expected_result": "拒绝重复创建",
        "module": "${request.model}",
        "submodule": None,
        "tags": ["异常", "业务规则"]
    },
    {
        "title": "边界值-字段长度上限",
        "type": "api",
        "priority": "P1",
        "preconditions": "已登录",
        "steps": [
            {"action": "发送 POST 请求，某字段值达到长度上限", "expected": "返回 201 或明确的长度限制错误"},
            {"action": "发送 POST 请求，某字段值超过长度上限", "expected": "返回 400，提示超出长度"}
        ],
        "expected_result": "边界值内正常处理，超出时有明确提示",
        "module": "${request.model}",
        "submodule": None,
        "tags": ["边界值"]
    },
    {
        "title": "权限校验-未登录访问",
        "type": "api",
        "priority": "P1",
        "preconditions": "未登录（无 Token）",
        "steps": [
            {"action": "不带 Authorization 头发送请求", "expected": "返回 401 Unauthorized"}
        ],
        "expected_result": "未认证时拒绝访问",
        "module": "${request.model}",
        "submodule": None,
        "tags": ["权限", "安全"]
    }
], ensure_ascii=False, indent=2)


def _detect_smart_response(request_body: dict) -> str | None:
    messages = request_body.get("messages", [])
    text = " ".join(m.get("content", "") for m in messages if isinstance(m.get("content"), str))
    for kw in _AI_CASE_KEYWORDS:
        if kw in text:
            return _resolve_template(_MOCK_CASES_JSON, request_body)
    return None


def _resolve_body(route: dict, request_body: dict) -> str:
    smart = _detect_smart_response(request_body)
    if smart:
        return smart
    mode = route.get("response_mode", "default")
    if mode == "random":
        raw = random.choice(RANDOM_RESPONSES)
    else:
        raw = route["response_body"]
    return _resolve_template(raw, request_body)


def build_response_json(route: dict, request_body: dict) -> tuple[dict, dict]:
    """构建非流式 Chat Completion 响应。返回 (response_body, extra_headers)"""
    completion_id = _gen_completion_id()
    created = int(time.time())
    req_model = request_body.get("model", "gpt-4o")
    resp_model = req_model if route["model_mode"] == "follow_request" else (route.get("custom_model") or req_model)

    status_code = route["status_code"]
    if status_code >= 400:
        body_text = _resolve_body(route, request_body)
        try:
            body = json.loads(body_text)
        except (json.JSONDecodeError, TypeError):
            err_type, err_code = _error_meta(status_code)
            body = {"error": {"message": body_text, "type": err_type, "param": None, "code": err_code}}
        return body, _build_headers(route, completion_id)

    response_type = route.get("response_type", "text")
    content = None
    refusal = None
    tool_calls_out = None

    if response_type == "refusal":
        refusal = _resolve_body(route, request_body)
    elif response_type == "tool_calls":
        tool_calls_cfg = route.get("tool_calls") or []
        tool_calls_out = []
        for tc in tool_calls_cfg:
            tool_calls_out.append({
                "id": _gen_call_id(),
                "type": "function",
                "function": {
                    "name": tc.get("name", "unknown"),
                    "arguments": tc.get("arguments", "{}"),
                },
            })
    else:
        content = _resolve_body(route, request_body)

    # Token 计算
    prompt_text = json.dumps(request_body.get("messages", []))
    if route["token_mode"] == "custom":
        prompt_tokens = route.get("custom_prompt_tokens") or 0
        completion_tokens = route.get("custom_completion_tokens") or 0
    else:
        prompt_tokens = estimate_tokens(prompt_text)
        completion_tokens = estimate_tokens(content or refusal or json.dumps(tool_calls_out or []))

    message: dict = {"role": "assistant", "content": content, "refusal": refusal, "annotations": []}
    if tool_calls_out:
        message["tool_calls"] = tool_calls_out
    finish_reason = route.get("finish_reason", "stop")

    body = {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": resp_model,
        "system_fingerprint": "fp_mock_v1",
        "choices": [
            {
                "index": 0,
                "message": message,
                "logprobs": None,
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "prompt_tokens_details": {"cached_tokens": 0, "audio_tokens": 0},
            "completion_tokens_details": {
                "reasoning_tokens": 0,
                "audio_tokens": 0,
                "accepted_prediction_tokens": 0,
                "rejected_prediction_tokens": 0,
            },
        },
        "service_tier": "default",
    }
    return body, _build_headers(route, completion_id)


async def build_response_stream(route: dict, request_body: dict) -> AsyncIterator[str]:
    """构建 SSE 流式 Chat Completion 响应。yield 每一行 SSE data"""
    completion_id = _gen_completion_id()
    created = int(time.time())
    req_model = request_body.get("model", "gpt-4o")
    resp_model = req_model if route["model_mode"] == "follow_request" else (route.get("custom_model") or req_model)
    finish_reason = route.get("finish_reason", "stop")
    chunk_delay = route.get("sse_chunk_delay_ms", 50) / 1000.0

    include_usage = False
    stream_opts = request_body.get("stream_options")
    if isinstance(stream_opts, dict):
        include_usage = stream_opts.get("include_usage", False)

    def _chunk(delta: dict, fr: str | None = None, usage: dict | None = None, choices_empty: bool = False) -> str:
        choices = [] if choices_empty else [{"index": 0, "delta": delta, "logprobs": None, "finish_reason": fr}]
        obj = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": resp_model,
            "system_fingerprint": "fp_mock_v1",
            "choices": choices,
        }
        if usage is not None:
            obj["usage"] = usage
        else:
            obj["usage"] = None
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    response_type = route.get("response_type", "text")

    if response_type == "tool_calls":
        # 流式 Tool Calls
        yield _chunk({"role": "assistant", "content": None, "tool_calls": None}, None)
        tool_calls_cfg = route.get("tool_calls") or []
        for idx, tc in enumerate(tool_calls_cfg):
            call_id = _gen_call_id()
            name = tc.get("name", "unknown")
            args = tc.get("arguments", "{}")
            # 第一个 chunk: id + name + type
            yield _chunk({"tool_calls": [{"index": idx, "id": call_id, "type": "function", "function": {"name": name, "arguments": ""}}]}, None)
            await asyncio.sleep(chunk_delay)
            # arguments 分块
            chunk_size = max(5, len(args) // 4)
            for i in range(0, len(args), chunk_size):
                frag = args[i:i + chunk_size]
                yield _chunk({"tool_calls": [{"index": idx, "function": {"arguments": frag}}]}, None)
                await asyncio.sleep(chunk_delay)
        # finish
        yield _chunk({}, finish_reason)
    elif response_type == "refusal":
        content_text = _resolve_body(route, request_body)
        yield _chunk({"role": "assistant", "refusal": ""}, None)
        for ch in content_text:
            yield _chunk({"refusal": ch}, None)
            await asyncio.sleep(chunk_delay)
        yield _chunk({}, finish_reason)
    else:
        content_text = _resolve_body(route, request_body)
        # 第一个 chunk: role
        yield _chunk({"role": "assistant", "content": ""}, None)
        # 内容逐字
        for ch in content_text:
            yield _chunk({"content": ch}, None)
            await asyncio.sleep(chunk_delay)
        # finish_reason chunk
        yield _chunk({}, finish_reason)

    # usage chunk
    if include_usage:
        prompt_text = json.dumps(request_body.get("messages", []))
        if route["token_mode"] == "custom":
            pt = route.get("custom_prompt_tokens") or 0
            ct = route.get("custom_completion_tokens") or 0
        else:
            ct_text = route["response_body"] if response_type == "text" else ""
            pt = estimate_tokens(prompt_text)
            ct = estimate_tokens(ct_text)
        usage_obj = {
            "prompt_tokens": pt,
            "completion_tokens": ct,
            "total_tokens": pt + ct,
        }
        yield _chunk({}, None, usage=usage_obj, choices_empty=True)

    yield "data: [DONE]\n\n"


def _build_headers(route: dict, request_id_or_completion_id: str) -> dict:
    headers = {
        "x-request-id": _gen_request_id(),
        "openai-processing-ms": str(route.get("delay_ms", 0)),
        "openai-version": "2024-06-01",
        "x-ratelimit-limit-requests": "10000",
        "x-ratelimit-limit-tokens": "2000000",
        "x-ratelimit-remaining-requests": "9999",
        "x-ratelimit-remaining-tokens": "1999500",
        "x-ratelimit-reset-requests": "6ms",
        "x-ratelimit-reset-tokens": "15ms",
    }
    custom = route.get("response_headers")
    if isinstance(custom, dict):
        headers.update(custom)
    return headers
