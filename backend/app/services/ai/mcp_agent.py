"""MCP Agent — 通过 Playwright MCP 真实操控浏览器，生成可执行的 Playwright 脚本。

核心流程：
1. 连接 Playwright MCP Server
2. 构造 LLM tool-use 请求（浏览器工具 + submit_script + verify_script）
3. Agent 循环：LLM 返回 tool_calls → 执行 → 回传结果 → 直到完成
4. 生成的脚本通过 pytest 验证

支持 OpenAI-compatible 和 Anthropic 两种 provider。
"""
from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import settings
from app.services.ai.mcp_bridge import PlaywrightMCPBridge
from app.services.ai.verify_tool import verify_script, MAX_VERIFY_RETRIES

logger = logging.getLogger(__name__)

MAX_AGENT_TURNS = 80


@dataclass
class AgentConfig:
    provider: str = ""
    base_url: str = ""
    api_key: str = ""
    auth_token: str = ""
    model: str = ""
    max_tokens: int = 8192
    temperature: float = 0.0
    timeout_seconds: int = 180

    @classmethod
    def from_settings(cls) -> AgentConfig:
        return cls(
            provider=settings.ai_provider,
            base_url=settings.ai_base_url,
            api_key=settings.ai_api_key,
            auth_token=settings.ai_auth_token,
            model=settings.ai_model,
            max_tokens=settings.ai_max_tokens,
            temperature=settings.ai_temperature,
            timeout_seconds=settings.ai_timeout_seconds,
        )


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class AgentResponse:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str = ""


# ─── LLM API helpers ───────────────────────────────────────

def _build_headers(cfg: AgentConfig) -> dict[str, str]:
    headers: dict[str, str] = {
        "content-type": "application/json",
        "User-Agent": "claude-cli/1.0",
    }
    if cfg.provider == "anthropic":
        headers["anthropic-version"] = "2023-06-01"
        if cfg.api_key:
            headers["x-api-key"] = cfg.api_key
    else:
        token = cfg.auth_token or cfg.api_key
        if token:
            headers["Authorization"] = f"Bearer {token}"
    return headers


def _build_endpoint(cfg: AgentConfig) -> str:
    base = cfg.base_url.rstrip("/")
    if cfg.provider == "anthropic":
        return f"{base}/messages" if base else "https://api.anthropic.com/v1/messages"
    return f"{base}/chat/completions"


def _build_request_body(
    cfg: AgentConfig, messages: list[dict], tools: list[dict],
) -> dict:
    if cfg.provider == "anthropic":
        system_parts = []
        chat_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_parts.append(m["content"] if isinstance(m["content"], str) else json.dumps(m["content"]))
            else:
                chat_msgs.append(m)
        body: dict = {
            "model": cfg.model,
            "messages": chat_msgs,
            "max_tokens": cfg.max_tokens,
            "temperature": cfg.temperature,
            "tools": tools,
        }
        if system_parts:
            body["system"] = "\n\n".join(system_parts)
        return body
    return {
        "model": cfg.model,
        "messages": messages,
        "max_tokens": cfg.max_tokens,
        "temperature": cfg.temperature,
        "tools": tools,
        "tool_choice": "auto",
    }


def _parse_response(cfg: AgentConfig, data: dict) -> AgentResponse:
    if cfg.provider == "anthropic":
        return _parse_anthropic_response(data)
    return _parse_openai_response(data)


def _parse_openai_response(data: dict) -> AgentResponse:
    choice = data.get("choices", [{}])[0]
    msg = choice.get("message", {})
    text = msg.get("content", "") or ""
    tool_calls = []
    for tc in msg.get("tool_calls", []):
        fn = tc.get("function", {})
        try:
            args = json.loads(fn.get("arguments", "{}"))
        except json.JSONDecodeError:
            args = {}
        tool_calls.append(ToolCall(id=tc["id"], name=fn["name"], arguments=args))
    return AgentResponse(
        text=text, tool_calls=tool_calls,
        finish_reason=choice.get("finish_reason", "stop"),
    )


def _parse_anthropic_response(data: dict) -> AgentResponse:
    text_parts = []
    tool_calls = []
    for block in data.get("content", []):
        if block.get("type") == "text":
            text_parts.append(block.get("text", ""))
        elif block.get("type") == "tool_use":
            tool_calls.append(ToolCall(
                id=block["id"], name=block["name"],
                arguments=block.get("input", {}),
            ))
    return AgentResponse(
        text="\n".join(text_parts), tool_calls=tool_calls,
        finish_reason=data.get("stop_reason", "end_turn"),
    )


def _build_assistant_message(cfg: AgentConfig, resp: AgentResponse) -> dict:
    """构造 assistant 消息（含 tool_calls），用于追加到对话历史。"""
    if cfg.provider == "anthropic":
        content = []
        if resp.text:
            content.append({"type": "text", "text": resp.text})
        for tc in resp.tool_calls:
            content.append({"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.arguments})
        return {"role": "assistant", "content": content}
    msg: dict[str, Any] = {"role": "assistant", "content": resp.text or None}
    if resp.tool_calls:
        msg["tool_calls"] = [
            {"id": tc.id, "type": "function", "function": {"name": tc.name, "arguments": json.dumps(tc.arguments, ensure_ascii=False)}}
            for tc in resp.tool_calls
        ]
    return msg


def _build_tool_result_messages(cfg: AgentConfig, results: list[tuple[str, str]]) -> list[dict]:
    """构造 tool_result 消息。results: [(tool_call_id, result_text), ...]"""
    if cfg.provider == "anthropic":
        content = [
            {"type": "tool_result", "tool_use_id": tc_id, "content": text}
            for tc_id, text in results
        ]
        return [{"role": "user", "content": content}]
    return [{"role": "tool", "tool_call_id": tc_id, "content": text} for tc_id, text in results]


async def _llm_call(cfg: AgentConfig, messages: list[dict], tools: list[dict]) -> AgentResponse:
    """调用 LLM API（支持 tool_use）。"""
    body = _build_request_body(cfg, messages, tools)
    headers = _build_headers(cfg)
    endpoint = _build_endpoint(cfg)

    async with httpx.AsyncClient(timeout=cfg.timeout_seconds) as client:
        resp = await client.post(endpoint, json=body, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"LLM API error {resp.status_code}: {resp.text[:500]}")
        return _parse_response(cfg, resp.json())


# ─── Agent 主循环 ──────────────────────────────────────────

SUBMIT_TOOL_DEF_OPENAI = {
    "type": "function",
    "function": {
        "name": "submit_script",
        "description": (
            "提交生成的 Python pytest-playwright 脚本。传入完整脚本内容。"
            "提交后必须调用 verify_script 验证。如验证失败，修复后再次提交。"
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "script_content": {
                    "type": "string",
                    "description": "完整的 Python pytest-playwright 脚本内容",
                },
            },
            "required": ["script_content"],
        },
    },
}

VERIFY_TOOL_DEF_OPENAI = {
    "type": "function",
    "function": {
        "name": "verify_script",
        "description": (
            "验证已提交的脚本。无需参数，自动读取最近一次 submit_script 提交的脚本并执行。"
            "返回 VERIFICATION PASSED 或 VERIFICATION FAILED + 错误详情。"
        ),
        "parameters": {"type": "object", "properties": {}},
    },
}

SUBMIT_TOOL_DEF_ANTHROPIC = {
    "name": "submit_script",
    "description": SUBMIT_TOOL_DEF_OPENAI["function"]["description"],
    "input_schema": SUBMIT_TOOL_DEF_OPENAI["function"]["parameters"],
}

VERIFY_TOOL_DEF_ANTHROPIC = {
    "name": "verify_script",
    "description": VERIFY_TOOL_DEF_OPENAI["function"]["description"],
    "input_schema": {"type": "object", "properties": {}},
}


def _build_task_prompt(
    test_case_title: str,
    test_steps: list[dict],
    expected_result: str | None,
    preconditions: str,
    base_url: str,
    credentials: dict[str, str],
    fixture_name: str = "logged_in_page",
) -> str:
    """构造 Agent 任务 prompt。"""
    steps_text = ""
    for i, step in enumerate(test_steps, 1):
        action = step.get("action", str(step))
        expected = step.get("expected", "")
        steps_text += f"  步骤 {i}: {action}"
        if expected:
            steps_text += f" → 预期: {expected}"
        steps_text += "\n"

    username = credentials.get("username", "admin")
    password = credentials.get("password", "admin123")

    return f"""请基于以下功能用例生成 UI 自动化测试脚本。

用例标题: {test_case_title}
前置条件: {preconditions or '无'}
测试步骤:
{steps_text}
整体预期结果: {expected_result or '无'}
被测应用地址: {base_url}

## 严格按三阶段执行

### 阶段一：浏览器探索
通过 Playwright MCP 工具真实操控浏览器，**只执行**用例步骤描述的操作。

0. 调用 browser_close 关闭任何已有会话（清残留，必须第一步）
1. 如需登录：
   - browser_navigate 到 {base_url}
   - browser_snapshot 看登录页结构
   - browser_fill 填用户名 '{username}'
   - browser_fill 填密码 '{password}'
   - browser_click 登录按钮
   - 等待登录完成
2. 按测试步骤逐步操作：
   - 执行操作（browser_click / browser_fill / browser_select_option 等）
   - browser_snapshot 记录**每步操作后**的页面状态
   - 验证预期结果

### 阶段二：生成 Python 脚本
根据阶段一记录的**真实选择器**，生成 Python pytest-playwright 脚本：
- import pytest, from playwright.sync_api import Page, expect
- 使用 `{fixture_name}` fixture（conftest 已提供登录和浏览器配置）
- 函数签名: `def test_generated({fixture_name}: Page):`
- 第一行: `page = {fixture_name}`
- 使用 get_by_role / get_by_text / locator 等选择器（从阶段一 snapshot 获取的真实选择器）
- 每步加 expect 断言
- **禁止 CSS 选择器 / get_by_label / get_by_placeholder**
- **禁止硬编码完整 URL**：必须用 `page.goto("/路径")`（相对路径），不要写 `page.goto("http://...")`。conftest 中 BASE_URL 已配置好，Playwright 的 page.goto 支持相对路径
- 表单输入用 page.fill（不用 page.type）
- 多选择器匹配时加 .first

### 阶段三：提交并验证
1. 调用 submit_script 提交完整脚本
2. 调用 verify_script 验证
3. 如果失败，根据错误修复脚本后重新 submit_script + verify_script，最多 3 轮

## 关键注意事项
- 表单必须用 browser_fill（清空后填入），不要用 browser_type（会追加）
- 多个字段必须顺序填写
- 只探索用例步骤要求的操作，不要自行扩展
- 禁止注释掉步骤、try/catch 吞错、永真断言
"""


@dataclass
class SSEEvent:
    """SSE 事件。"""
    event: str
    data: dict[str, Any]


async def run_mcp_agent(
    test_case_title: str,
    test_steps: list[dict],
    expected_result: str | None,
    preconditions: str,
    base_url: str,
    env_vars: dict[str, str],
    credentials: dict[str, str],
    fixture_name: str = "logged_in_page",
    agent_config: AgentConfig | None = None,
) -> AsyncGenerator[SSEEvent, None]:
    """运行 MCP Agent，流式产出 SSE 事件。

    事件类型：
    - status: 状态更新
    - step_start: 开始一个步骤（browser 操作）
    - step_done: 步骤完成
    - tool_call: 工具调用
    - tool_result: 工具结果
    - token: LLM 文本输出
    - verification: 脚本验证结果
    - done: 完成（含 script_content）
    - error: 错误
    """
    cfg = agent_config or AgentConfig.from_settings()
    bridge = PlaywrightMCPBridge(headless=not bool(__import__("os").environ.get("DISPLAY")))
    shared_state: dict[str, Any] = {"script_content": "", "version": 0}
    step_seq = 0

    verify_env = {**env_vars}
    verify_env.setdefault("ADMIN_USERNAME", credentials.get("username", ""))
    verify_env.setdefault("ADMIN_PASSWORD", credentials.get("password", ""))
    verify_env.setdefault("TENANT_USERNAME", credentials.get("username", ""))
    verify_env.setdefault("TENANT_PASSWORD", credentials.get("password", ""))

    try:
        yield SSEEvent("status", {"content": "正在启动 Playwright MCP Server..."})
        await bridge.connect()
        mcp_tools = await bridge.list_tools()

        browser_tools = bridge.get_tools_for_llm(provider=cfg.provider)
        if cfg.provider == "anthropic":
            all_tools = browser_tools + [SUBMIT_TOOL_DEF_ANTHROPIC, VERIFY_TOOL_DEF_ANTHROPIC]
        else:
            all_tools = browser_tools + [SUBMIT_TOOL_DEF_OPENAI, VERIFY_TOOL_DEF_OPENAI]

        yield SSEEvent("status", {"content": f"已连接，{len(mcp_tools)} 个浏览器工具 + submit + verify"})

        task_prompt = _build_task_prompt(
            test_case_title=test_case_title,
            test_steps=test_steps,
            expected_result=expected_result,
            preconditions=preconditions,
            base_url=base_url,
            credentials=credentials,
            fixture_name=fixture_name,
        )

        messages: list[dict] = [
            {"role": "system", "content": (
                "你是 UI 自动化测试专家。通过 Playwright MCP 工具操控真实浏览器，"
                "探索目标页面，生成可执行的 Python pytest-playwright 测试脚本。"
                "你必须先用浏览器工具探索，从 snapshot 中获取真实的元素选择器，"
                "然后生成使用这些真实选择器的脚本。不要猜测选择器。"
            )},
            {"role": "user", "content": task_prompt},
        ]

        yield SSEEvent("status", {"content": "Agent 开始执行..."})

        for turn in range(MAX_AGENT_TURNS):
            resp = await _llm_call(cfg, messages, all_tools)

            if resp.text:
                yield SSEEvent("token", {"content": resp.text})

            if not resp.tool_calls:
                break

            messages.append(_build_assistant_message(cfg, resp))

            tool_results: list[tuple[str, str]] = []

            for tc in resp.tool_calls:
                if tc.name == "submit_script":
                    content = tc.arguments.get("script_content", "")
                    if not content.strip():
                        result_text = "SUBMIT ERROR: 脚本内容为空。"
                    else:
                        shared_state["script_content"] = content
                        shared_state["version"] = shared_state.get("version", 0) + 1
                        v = shared_state["version"]
                        result_text = f"SCRIPT SUBMITTED (v{v}): 脚本已保存。请调用 verify_script 验证。"
                    yield SSEEvent("status", {"content": f"脚本已提交 (v{shared_state.get('version', 0)})"})
                    tool_results.append((tc.id, result_text))

                elif tc.name == "verify_script":
                    script = shared_state.get("script_content", "")
                    if not script.strip():
                        result_text = "VERIFICATION ERROR: 没有已提交的脚本。请先调用 submit_script。"
                    else:
                        yield SSEEvent("status", {"content": "正在验证脚本..."})
                        result_text = await verify_script(script, base_url, verify_env)
                        v_status = "passed" if "VERIFICATION PASSED" in result_text else "failed"
                        yield SSEEvent("verification", {"status": v_status, "output": result_text[:2000]})

                        version = shared_state.get("version", 0)
                        if "VERIFICATION FAILED" in result_text and version >= MAX_VERIFY_RETRIES:
                            stop_idx = result_text.find("\n\n请根据错误信息修复脚本")
                            if stop_idx != -1:
                                result_text = result_text[:stop_idx]
                            result_text += (
                                f"\n\n⚠️ 已达到最大验证次数（{version} 次）。"
                                "不要再次调用 submit_script 或 verify_script。"
                                "当前版本作为最终提交，直接结束。"
                            )
                    tool_results.append((tc.id, result_text))

                else:
                    step_seq += 1
                    friendly = _friendly_tool_label(tc.name, tc.arguments)
                    yield SSEEvent("step_start", {"seq": step_seq, "action": friendly, "phase": "action"})
                    try:
                        result_text = await bridge.call_tool(tc.name, tc.arguments)
                        yield SSEEvent("step_done", {"seq": step_seq, "action": friendly, "status": "passed"})
                    except Exception as exc:
                        result_text = f"Tool error: {type(exc).__name__}: {str(exc)[:500]}"
                        yield SSEEvent("step_done", {"seq": step_seq, "action": friendly, "status": "failed", "error": str(exc)[:200]})
                    tool_results.append((tc.id, result_text))

            messages.extend(_build_tool_result_messages(cfg, tool_results))

        script_content = shared_state.get("script_content", "")
        if script_content:
            yield SSEEvent("done", {
                "script_content": script_content,
                "all_passed": shared_state.get("version", 0) > 0,
            })
        else:
            yield SSEEvent("error", {"content": "Agent 未调用 submit_script，脚本未生成。"})

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {str(exc)[:500]}"
        logger.error("mcp_agent_failed", exc_info=True)
        if shared_state.get("script_content"):
            yield SSEEvent("done", {"script_content": shared_state["script_content"], "all_passed": False})
        else:
            yield SSEEvent("error", {"content": error_msg})
    finally:
        try:
            await bridge.close()
        except Exception:
            pass


def _friendly_tool_label(name: str, args: dict) -> str:
    """把 MCP 工具调用转成人类可读的标签。"""
    labels = {
        "browser_navigate": lambda a: f"导航到 {a.get('url', '')}",
        "browser_click": lambda a: f"点击 {a.get('element', a.get('ref', ''))}",
        "browser_fill": lambda a: f"填写 {a.get('element', a.get('ref', ''))} = {a.get('value', '')[:30]}",
        "browser_type": lambda a: f"输入 {a.get('element', a.get('ref', ''))}",
        "browser_select_option": lambda a: f"选择 {a.get('element', a.get('ref', ''))}",
        "browser_snapshot": lambda _: "获取页面快照",
        "browser_take_screenshot": lambda _: "截图",
        "browser_close": lambda _: "关闭浏览器",
        "browser_go_back": lambda _: "后退",
        "browser_go_forward": lambda _: "前进",
        "browser_wait": lambda a: f"等待 {a.get('time', '')}ms",
        "browser_press_key": lambda a: f"按键 {a.get('key', '')}",
        "browser_hover": lambda a: f"悬停 {a.get('element', a.get('ref', ''))}",
    }
    fn = labels.get(name)
    if fn:
        try:
            return fn(args)
        except Exception:
            pass
    return name
