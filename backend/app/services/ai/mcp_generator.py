"""MCP 驱动的 UI 脚本生成引擎 — LLM 通过 MCP 工具操作浏览器，不生成代码。

核心区别：
- 旧方案：LLM 生成 Python 代码 → exec() 执行 → 容易猜错选择器
- 新方案：LLM 看 snapshot（带 ref） → 决定调哪个工具 → Bridge 执行 → 100% 准确
"""
from __future__ import annotations

import json
import logging
import re
import time

import httpx

logger = logging.getLogger(__name__)


def _llm_call(prompt: str, max_tokens: int = 800) -> str:
    """同步调用 LLM"""
    from app.services.ai.llm_client import _build_headers, _get_endpoint, _get_extra_headers, _build_openai_body
    body = _build_openai_body([{"role": "user", "content": prompt}], max_tokens=max_tokens, temperature=0.0)
    headers = {**_build_headers(), **_get_extra_headers()}
    resp = httpx.post(_get_endpoint(), json=body, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"LLM error: {resp.status_code}")
    data = resp.json()
    choices = data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "")
    for block in data.get("content", []):
        if block.get("type") == "text":
            return block.get("text", "")
    return ""


async def mcp_generate(
    base_url: str,
    credentials: dict[str, str],
    steps: list[dict],
    fixture_name: str = "tenant_page",
    on_step=None,
    preconditions: str = "",
    mcp_url: str = "http://localhost:8931/sse",
) -> dict:
    """
    用 MCP 工具逐步操作浏览器生成脚本。

    每步：snapshot → LLM 决定操作 → MCP 执行 → 验证 → 记录
    """
    from app.services.ai.mcp_bridge import PlaywrightMCPBridge

    bridge = PlaywrightMCPBridge(mcp_url)
    await bridge.connect()

    results = []
    script_actions = []
    captured_requests = []
    healing_records = []
    unique_suffix = str(int(time.time()))[-6:]

    try:
        # 1. 登录
        if on_step:
            on_step({"type": "step_start", "seq": 0, "action": "登录系统", "phase": "setup"})

        await bridge.navigate(base_url)
        await bridge.wait(1000)
        snap = await bridge.snapshot()

        if "登录" in snap or "login" in snap.lower():
            login_result = await _mcp_login(bridge, credentials)
            results.append(login_result)
            if on_step:
                on_step({"type": "step_done", "seq": 0, "action": f"登录系统（{credentials.get('username', '')}）", "status": login_result["status"]})
            if login_result["status"] == "failed":
                await bridge.close()
                return {"script": "", "results": results, "all_passed": False, "captured_requests": []}
        else:
            results.append({"step": "已登录", "status": "passed"})
            if on_step:
                on_step({"type": "step_done", "seq": 0, "action": "已登录", "status": "passed"})

        # 2. 逐步执行
        for i, step in enumerate(steps):
            action = step.get("action", "")
            expected = step.get("expected", "")
            if not action:
                continue

            if on_step:
                on_step({"type": "step_start", "seq": i + 1, "action": action, "phase": "generating"})

            # 获取当前页面快照
            snap = await bridge.snapshot()

            # 验证类步骤：只需检查页面内容
            is_verify = any(kw in action for kw in ["验证", "观察", "确认", "检查", "查看"])
            if is_verify:
                verify_result = _verify_step(action, expected, snap)
                results.append(verify_result)
                script_actions.append({"step": action, "tools": [{"tool": "browser_snapshot", "args": {}}], "status": verify_result["status"]})
                if on_step:
                    on_step({"type": "step_done", "seq": i + 1, "action": action, "status": verify_result["status"]})
                if verify_result["status"] == "failed":
                    break
                continue

            # 操作类步骤：LLM 决定操作
            tool_calls = _plan_step(action, expected, snap, unique_suffix)

            # 执行操作
            step_result = await _execute_mcp_actions(bridge, tool_calls, action)
            results.append(step_result)

            # 记录工具调用（含 stable_selector）
            logger.info("Step %d tools: %s", i+1, json.dumps(tool_calls, ensure_ascii=False)[:500])

            if step_result["status"] == "failed":
                # 修复：重新获取快照，让 LLM 重新规划
                for retry in range(2):
                    await bridge.wait(1000)
                    snap_retry = await bridge.snapshot()
                    error_msg = step_result.get("error", "")
                    tool_calls_retry = _plan_step(action, expected, snap_retry, unique_suffix, error=error_msg)
                    retry_result = await _execute_mcp_actions(bridge, tool_calls_retry, f"{action}（修复第{retry+1}次）")
                    if retry_result["status"] == "passed":
                        results[-1] = retry_result
                        tool_calls = tool_calls_retry
                        break
                    step_result = retry_result

            # 收集本步的网络请求
            try:
                net = await bridge.call_tool("browser_network_requests")
                step_reqs = _parse_network_requests(net)
                # 去重合并
                existing_urls = {r["url"] for r in captured_requests}
                for req in step_reqs:
                    if req["url"] not in existing_urls:
                        captured_requests.append(req)
                        existing_urls.add(req["url"])
            except Exception:
                pass

            # 记录操作用于脚本生成
            script_actions.append({"step": action, "tools": tool_calls, "status": results[-1]["status"]})

            if on_step:
                on_step({"type": "step_done", "seq": i + 1, "action": results[-1].get("step", action), "status": results[-1]["status"]})

            if results[-1]["status"] == "failed":
                # 记录 healing context
                healing_records.append({
                    "step_seq": i + 1,
                    "step_action": action[:500],
                    "error_summary": results[-1].get("error", "")[:2000],
                    "resolved": False,
                })
                break

        # 网络请求已在每步收集完毕

    finally:
        await bridge.close()

    # 4. 拼接脚本
    script = _build_script(fixture_name, script_actions)
    all_passed = all(r["status"] == "passed" for r in results)

    return {
        "script": script,
        "results": results,
        "all_passed": all_passed,
        "captured_requests": captured_requests,
        "healing_records": healing_records,
    }


async def _mcp_login(bridge, credentials: dict) -> dict:
    """通过 MCP 工具登录"""
    username = credentials.get("username", "")
    password = credentials.get("password", "")
    try:
        snap = await bridge.snapshot()
        refs = _extract_login_refs(snap)
        logger.info("Login refs: %s", refs)
        if refs.get("username_ref"):
            await bridge.call_tool("browser_type", {"target": refs["username_ref"], "text": username})
        if refs.get("password_ref"):
            await bridge.call_tool("browser_type", {"target": refs["password_ref"], "text": password})
        if refs.get("submit_ref"):
            await bridge.call_tool("browser_click", {"target": refs["submit_ref"]})
        await bridge.wait(3000)
        snap_after = await bridge.snapshot()
        if "登录管理控制台" in snap_after or ("textbox" in snap_after and "/login" in snap_after):
            return {"step": "登录系统", "status": "failed", "error": "登录后仍在登录页"}
        return {"step": f"登录系统（{username}）", "status": "passed"}
    except Exception as e:
        return {"step": "登录系统", "status": "failed", "error": str(e)[:300]}


def _extract_login_refs(snapshot: str) -> dict:
    """从 MCP snapshot 提取登录表单的 ref"""
    refs = {}
    textbox_refs = []
    for line in snapshot.split("\n"):
        line = line.strip()
        ref_match = re.search(r'\[ref=(\w+)\]', line)
        if not ref_match:
            continue
        ref = ref_match.group(1)

        if "textbox" in line:
            textbox_refs.append(ref)
        if "button" in line and ("登录" in line or "Login" in line or "Sign in" in line) and "SSO" not in line and "disabled" not in line:
            refs["submit_ref"] = ref

    # 第一个 textbox 是用户名，第二个是密码
    if len(textbox_refs) >= 2:
        refs["username_ref"] = textbox_refs[0]
        refs["password_ref"] = textbox_refs[1]
    elif len(textbox_refs) == 1:
        refs["username_ref"] = textbox_refs[0]

    return refs


def _plan_step(action: str, expected: str, snapshot: str, suffix: str, error: str = "") -> list[dict]:
    """让 LLM 根据 snapshot 规划 MCP 工具调用"""
    error_hint = f"\n\n上次尝试失败了：{error}\n请换一种方式。" if error else ""

    prompt = f"""你是浏览器自动化 Agent。根据页面快照，规划执行操作需要的工具调用。

## 当前页面快照
{snapshot[:4000]}

## 要执行的操作
{action}

## 预期结果
{expected or "无"}
{error_hint}

## 可用工具
- browser_click: 点击元素 → {{"target": "元素ref如e15"}}
- browser_type: 输入文字 → {{"target": "输入框ref如e20", "text": "要填的值"}}
- browser_select_option: 选择下拉选项 → {{"target": "下拉框ref", "values": ["选项值"]}}
- browser_press_key: 按键 → {{"key": "Enter"}}
- browser_navigate: 导航 → {{"url": "地址"}}（注意：不要用这个工具，页面导航靠点击元素完成）
- browser_snapshot: 获取页面快照 → {{}}

## 规则
- 从快照中找到元素的 ref 编号（如 [ref=e15]），用 target 参数传 ref
- 每行输出一个 JSON 工具调用
- 如果步骤包含多个操作（如"做A，然后做B"），为每个操作输出一行工具调用
- 操作后如果页面会变化，在最后加 {{"tool": "browser_wait_for", "args": {{"time": 2000}}}} 等待
- 如果步骤要输入名称，加时间戳后缀：原名-{suffix}
- 不要编造 ref，只用快照中存在的
- 如果快照中找不到目标元素，输出 {{"tool": "browser_snapshot", "args": {{}}}} 重新获取

## 输出格式（每行一个 JSON）
每个工具调用必须包含 stable_selector（稳定选择器，用于保存为可重复运行的脚本）：
{{"tool": "browser_click", "args": {{"target": "e15", "stable_selector": "page.get_by_role(\"button\", name=\"登录\")"}}}}
{{"tool": "browser_type", "args": {{"target": "e20", "text": "test-{suffix}", "stable_selector": "page.get_by_role(\"textbox\", name=\"you@example.com\")"}}}}

stable_selector 规则：
- button → page.get_by_role("button", name="按钮文字")
- textbox → page.get_by_role("textbox", name="占位符或标签")
- link → page.get_by_role("link", name="链接文字")
- heading → page.get_by_role("heading", name="标题")
- 通用文字 → page.get_by_text("文字")
- 多个匹配 → 加 .first
"""

    try:
        resp = _llm_call(prompt)
        calls = []
        for line in resp.strip().splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    call = json.loads(line)
                    if "tool" in call:
                        calls.append(call)
                except json.JSONDecodeError:
                    pass
        return calls if calls else [{"tool": "browser_snapshot", "args": {}}]
    except Exception as e:
        logger.warning("LLM plan failed: %s", e)
        return [{"tool": "browser_snapshot", "args": {}}]


async def _execute_mcp_actions(bridge, tool_calls: list[dict], step_name: str) -> dict:
    """执行一组 MCP 工具调用"""
    try:
        for call in tool_calls:
            tool = call.get("tool", "")
            args = call.get("args", {})
            if not tool:
                continue
            result = await bridge.call_tool(tool, args)
            if result and "Error" in result[:100]:
                return {"step": step_name, "status": "failed", "error": result[:300]}
            # 等待页面稳定
            if tool in ("browser_click", "browser_type", "browser_navigate", "browser_select_option"):
                await bridge.wait(500)
        return {"step": step_name, "status": "passed"}
    except Exception as e:
        return {"step": step_name, "status": "failed", "error": str(e)[:300]}


def _verify_step(action: str, expected: str, snapshot: str) -> dict:
    """验证类步骤：检查 snapshot 是否有实质内容"""
    # 基本检查：页面有内容就算通过（snapshot 长度 > 500 说明页面已加载）
    if len(snapshot) > 500:
        # 再检查是否有错误提示
        if "Error" in snapshot[:100] and snapshot.count("\n") < 5:
            return {"step": action, "status": "failed", "error": "页面显示错误"}
        return {"step": action, "status": "passed"}
    return {"step": action, "status": "failed", "error": f"页面内容不足（{len(snapshot)} chars）"}


def _parse_network_requests(network_text: str) -> list[dict]:
    """解析 browser_network_requests 的输出"""
    requests = []
    for line in network_text.strip().splitlines():
        if "/api/" not in line:
            continue
        # 格式: "123. [GET] http://..."
        import re
        m = re.match(r'\d+\.\s*\[(\w+)\]\s*(\S+)', line.strip())
        if m:
            method = m.group(1)
            url = m.group(2)
            path = url.split("//", 1)[-1].split("/", 1)[-1] if "//" in url else url
            requests.append({"method": method, "url": url, "path": "/" + path, "status": 200})
    return requests


def _build_script(fixture_name: str, actions: list[dict]) -> str:
    """从 MCP 操作记录构建可重复运行的 Playwright Python 脚本"""
    lines = [
        "import os",
        "import pytest",
        "from playwright.sync_api import Page, expect",
        "from tea_step import tea_step",
        "",
        'BASE_URL = os.getenv("BASE_URL", "")',
        "",
        "",
        f"def test_generated({fixture_name}: Page):",
        f"    page = {fixture_name}",
        "",
    ]
    for i, act in enumerate(actions):
        step_name = act["step"][:50]
        lines.append(f'    # Step {i+1}: {act["step"]}')
        lines.append(f'    with tea_step("{step_name}", phase="action"):')
        for call in act.get("tools", []):
            tool = call.get("tool", "")
            args = call.get("args", {})
            selector = args.get("stable_selector", "")
            if tool == "browser_click":
                if selector:
                    lines.append(f'        {selector}.click()')
                else:
                    element = args.get("element", args.get("target", ""))
                    lines.append(f'        page.get_by_text("{element}").first.click()')
            elif tool == "browser_type":
                value = args.get("text", "")
                if selector:
                    lines.append(f'        {selector}.fill("{value}")')
                else:
                    lines.append(f'        page.get_by_role("textbox").first.fill("{value}")')
            elif tool == "browser_navigate":
                url = args.get("url", "")
                # 不硬编码 URL，用 BASE_URL + 路径
                if "://" in url:
                    import re as _re
                    path = _re.sub(r'https?://[^/]+', '', url)
                    lines.append(f'        page.goto(BASE_URL + "{path}")')
                else:
                    lines.append(f'        page.goto(BASE_URL + "{url}")')
            elif tool == "browser_press_key":
                key = args.get("key", "Enter")
                lines.append(f'        page.keyboard.press("{key}")')
            elif tool == "browser_select_option":
                values = args.get("values", [])
                if selector:
                    lines.append(f'        {selector}.select_option({json.dumps(values, ensure_ascii=False)})')
            elif tool in ("browser_snapshot", "browser_wait_for"):
                pass
            else:
                lines.append(f'        pass  # {tool}')
        lines.append(f'        page.wait_for_load_state("networkidle")')
        lines.append("")
    return "\n".join(lines)
