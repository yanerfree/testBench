"""逐步生成引擎 — 一步一步生成+执行 Playwright 代码，每步都基于真实页面状态"""
from __future__ import annotations

import json
import logging
import re
import time

import httpx

logger = logging.getLogger(__name__)


def _llm_complete_sync(prompt: str, max_tokens: int = 500) -> str:
    """同步调用 LLM"""
    from app.services.ai.llm_client import _build_headers, _get_endpoint, _get_extra_headers, _build_openai_body

    body = _build_openai_body(
        [{"role": "user", "content": prompt}],
        max_tokens=max_tokens, temperature=0.0,
    )
    headers = {**_build_headers(), **_get_extra_headers()}
    endpoint = _get_endpoint()

    resp = httpx.post(endpoint, json=body, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"LLM API error: {resp.status_code} {resp.text[:200]}")
    data = resp.json()

    choices = data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "")
    content_blocks = data.get("content", [])
    for block in content_blocks:
        if block.get("type") == "text":
            return block.get("text", "")
    return ""


def step_by_step_generate(
    base_url: str,
    credentials: dict[str, str],
    steps: list[dict],
    fixture_name: str = "tenant_page",
    llm_complete=None,
    on_step=None,
    healing_history: list[dict] | None = None,
) -> dict:
    """
    逐步生成 Playwright 脚本。

    对每个用例步骤：拿页面 snapshot → LLM 生成代码 → 执行 → 验证

    Returns: {
        "script": str,           # 完整 Python 脚本
        "results": [             # 每步结果
            {"step": str, "code": str, "status": "passed"|"failed", "error": str|None, "snapshot": str}
        ],
        "all_passed": bool,
    }
    """
    from playwright.sync_api import sync_playwright

    results = []
    code_blocks = []
    func_name = "test_generated"
    healing_records = []  # 收集修复档案
    if llm_complete is None:
        llm_complete = _llm_complete_sync

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(locale="zh-CN", viewport={"width": 1280, "height": 720})
        page = context.new_page()
        page.set_default_timeout(10000)

        # 登录
        login_result = _do_login(page, base_url, credentials)
        results.append(login_result)
        if on_step:
            on_step({"type": "step_done", "action": login_result["step"], "status": login_result["status"], "seq": 0})
        if login_result["status"] == "failed":
            browser.close()
            return {"script": "", "results": results, "all_passed": False}

        # 逐步骤生成
        for i, step in enumerate(steps):
            action = step.get("action", "")
            expected = step.get("expected", "")
            if not action:
                continue

            # 检测是否需要拆成"打开下拉+选择"两步
            is_select_step = any(kw in action for kw in ["下拉", "选择", "请选择"])

            # 1. 拿当前页面 snapshot
            if on_step:
                on_step({"type": "step_start", "seq": i + 1, "action": action, "phase": "generating"})
            try:
                snapshot = page.locator("body").aria_snapshot()[:6000]
            except Exception:
                snapshot = ""

            # 2. 查历史修复记录
            history_hint = ""
            if healing_history:
                relevant = [h for h in healing_history if h.get("step_seq") == i + 1 or h.get("page_url") == page.url]
                if relevant:
                    failed_codes = [h["original_code"] for h in relevant if not h.get("resolved")]
                    if failed_codes:
                        history_hint = "\n以下代码在之前尝试中失败过，请避免类似写法：\n" + "\n".join(f"- {c[:100]}" for c in failed_codes[:3])

            # 3. LLM 生成这一步的代码
            step_code = _generate_one_step(
                llm_complete=llm_complete,
                step_num=i + 1,
                action=action,
                expected=expected,
                snapshot=snapshot,
                page_url=page.url,
                history_hint=history_hint,
            )

            # 3. 执行
            exec_result = _execute_step(page, step_code, action)
            exec_result["code"] = step_code
            exec_result["snapshot"] = snapshot[:500]
            results.append(exec_result)
            code_blocks.append(f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(step_code, 8))

            if exec_result["status"] == "passed":
                if on_step:
                    on_step({"type": "step_done", "seq": i + 1, "action": action, "status": "passed"})

                # 选择类步骤：执行后可能打开了下拉，需要拿新 snapshot 让 AI 选择选项
                if is_select_step and "选择" in action:
                    try:
                        page.wait_for_timeout(500)
                        new_snap = page.locator("body").aria_snapshot()[:6000]
                        select_code = _generate_one_step(
                            llm_complete=llm_complete, step_num=i + 1,
                            action=f"在已打开的下拉列表中选择第一个可用选项",
                            expected="选中选项", snapshot=new_snap, page_url=page.url,
                        )
                        select_result = _execute_step(page, select_code, f"{action}（选择选项）")
                        if select_result["status"] == "passed":
                            code_blocks[-1] += _indent(select_code, 8)
                    except Exception:
                        pass

            elif exec_result["status"] == "failed":
                # 尝试修复，最多 3 次
                fixed = False
                last_error = exec_result.get("error", "")
                for fix_attempt in range(3):
                    try:
                        page.wait_for_load_state("domcontentloaded")
                        current_snapshot = page.locator("body").aria_snapshot()[:6000]
                    except Exception:
                        current_snapshot = snapshot

                    fix_code = _fix_one_step(
                        llm_complete=llm_complete,
                        action=action,
                        original_code=step_code if fix_attempt == 0 else fix_code,
                        error=last_error,
                        snapshot=current_snapshot,
                    )
                    if not fix_code or fix_code == step_code:
                        break

                    fix_result = _execute_step(page, fix_code, f"{action}（修复第{fix_attempt+1}次）")
                    if fix_result["status"] == "passed":
                        fix_result["code"] = fix_code
                        results[-1] = fix_result
                        code_blocks[-1] = f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(fix_code, 8)
                        fixed = True
                        healing_records.append({
                            "step_seq": i + 1, "step_action": action[:500], "page_url": page.url,
                            "original_code": step_code, "error_summary": last_error[:2000],
                            "fix_code": fix_code, "fix_method": f"auto_fix_attempt_{fix_attempt+1}",
                            "page_snapshot": current_snapshot[:2000], "resolved": True,
                        })
                        if on_step:
                            on_step({"type": "step_done", "seq": i + 1, "action": f"{action}（修复第{fix_attempt+1}次）", "status": "passed"})
                        break
                    else:
                        last_error = fix_result.get("error", "")
                        step_code = fix_code

                if not fixed:
                    # 分类失败原因
                    failure_type = _classify_failure(llm_complete, action, last_error, current_snapshot if 'current_snapshot' in dir() else snapshot)
                    healing_records.append({
                        "step_seq": i + 1, "step_action": action[:500], "page_url": page.url,
                        "failure_type": failure_type,
                        "original_code": step_code, "error_summary": last_error[:2000],
                        "fix_code": None, "fix_method": "all_attempts_failed",
                        "page_snapshot": (current_snapshot if 'current_snapshot' in dir() else snapshot)[:2000],
                        "resolved": False,
                    })
                    if on_step:
                        on_step({"type": "step_done", "seq": i + 1, "action": action, "status": "failed", "error": last_error[:200], "failure_type": failure_type})
                    break

        browser.close()

    # 拼接完整脚本
    script = _assemble_script(func_name, fixture_name, code_blocks)
    all_passed = all(r["status"] == "passed" for r in results)

    return {"script": script, "results": results, "all_passed": all_passed, "healing_records": healing_records}


def _do_login(page, base_url: str, credentials: dict) -> dict:
    """登录"""
    try:
        page.goto(base_url)
        page.wait_for_load_state("networkidle")
        if "/login" not in page.url:
            return {"step": "已登录", "status": "passed"}
        username = credentials.get("username", "")
        password = credentials.get("password", "")
        for inp in page.locator("input:not([type=hidden])").all():
            t = inp.get_attribute("type") or "text"
            if t == "password":
                inp.fill(password)
            elif t in ("text", "email", ""):
                inp.fill(username)
        submit = page.locator("button[type=submit]")
        if submit.count() == 0:
            submit = page.get_by_role("button", name="登录", exact=True)
        submit.first.click()
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
        page.wait_for_load_state("networkidle")
        return {"step": f"登录系统（{username}）", "status": "passed"}
    except Exception as e:
        return {"step": "登录系统", "status": "failed", "error": str(e)[:300]}


def _generate_one_step(llm_complete, step_num: int, action: str, expected: str, snapshot: str, page_url: str, history_hint: str = "") -> str:
    """调 LLM 生成单个步骤的 Playwright 代码"""
    prompt = f"""你是 Playwright 代码生成器。根据当前页面的 Aria Snapshot，生成执行一步操作的 Python 代码。

## 当前页面
URL: {page_url}
Aria Snapshot:
```yaml
{snapshot}
```

## 要执行的操作
{action}

## 预期结果
{expected or "无"}

## 选择器规则（必须遵守）
1. `textbox "xxx"` → `page.get_by_role("textbox", name="xxx")`
2. `button "xxx"` → `page.get_by_role("button", name="xxx")`
3. `heading "xxx"` → `page.get_by_role("heading", name="xxx")`
4. `link "xxx"` → `page.get_by_role("link", name="xxx")`
5. `checkbox "xxx"` → `page.get_by_role("checkbox", name="xxx")`
6. 匹配多个元素 → 加 `.first` 或 `.nth(0)`
7. 下拉菜单/弹窗临时选项 → `page.get_by_text("文字").click()`
8. 选择下拉框：先 `page.get_by_text("请选择…").click()` 打开，再 `page.get_by_text("选项名").click()`

## 禁止（违反会导致执行失败）
- ❌ get_by_label — 自定义组件 label 关联不可靠
- ❌ get_by_placeholder — placeholder 不在 aria snapshot 中
- ❌ CSS 选择器（.ant-xxx, [class*=xxx]）
- ❌ get_by_role("option") — 自定义下拉没有 option 角色
- ❌ import / from / def / class / sync_playwright / browser = 等非操作代码
- ❌ async def / await（代码在同步环境执行）
- ❌ 编造 snapshot 中不存在的元素名称

## 常见操作模式
- 输入文字: `page.get_by_role("textbox", name="xxx").fill("值")`
- 清空再输入: `page.get_by_role("textbox", name="xxx").clear()` + `.fill("值")`
- 输入名称/ID: 在原文后加时间戳避免重复，如 `"core-api-" + str(int(time.time()))[-6:]`
- 点击按钮: `page.get_by_role("button", name="xxx").click()`
- 点击菜单: `page.get_by_text("菜单名").click()`
- 等待加载: `page.wait_for_load_state("networkidle")`
- 验证可见: `expect(page.get_by_role("heading", name="xxx")).to_be_visible()`
- 验证包含文字: `expect(page.locator("body")).to_contain_text("xxx")`
- 等待状态变化: `page.wait_for_timeout(3000)` + `expect(...).to_be_visible(timeout=10000)`

## 输出
只输出 2-6 行 page.xxx 调用。不要任何其他内容。
正确示例:
page.get_by_text("服务管理").click()
page.wait_for_load_state("networkidle")
{history_hint}"""

    if llm_complete is None:
        return f'page.get_by_text("{action[:20]}").click()\npage.wait_for_load_state("domcontentloaded")'

    try:
        resp = llm_complete(prompt)
        code = _clean_step_code(resp)
        return code if code.strip() else "pass"
    except Exception as e:
        logger.warning("LLM 生成步骤 %d 失败: %s", step_num, e)
        return f'# LLM 生成失败: {e}\npass'


def _fix_one_step(llm_complete, action: str, original_code: str, error: str, snapshot: str) -> str | None:
    """调 LLM 修复一个步骤"""
    if llm_complete is None:
        return None

    prompt = f"""修复以下 Playwright 代码。只输出修复后的 2-6 行 page.xxx 调用代码。

原代码:
{original_code}

错误:
{error}

当前页面 Aria Snapshot:
```yaml
{snapshot[:2000]}
```

修复规则:
- 从 Snapshot 找正确的 role+name，用 get_by_role/get_by_text
- ❌ 禁止: get_by_placeholder, get_by_label, CSS 选择器, get_by_role("option")
- strict mode violation → 加 .first 或用更精确文字
- timeout → 换一个 Snapshot 中存在的元素
- 选择下拉: page.get_by_text("请选择…").click() → page.get_by_text("选项名").click()
- 不要输出 import/def/class/async/markdown"""

    try:
        resp = llm_complete(prompt)
        code = _clean_step_code(resp)
        return code.strip() or None
    except Exception:
        return None


def _execute_step(page, code: str, step_name: str) -> dict:
    """在浏览器中执行一段代码"""
    # 等待/观察类步骤给更长超时
    is_wait_step = any(kw in step_name for kw in ["等待", "观察", "同步"])
    if is_wait_step:
        page.set_default_timeout(30000)
    try:
        exec(code, {"page": page, "expect": __import__("playwright.sync_api", fromlist=["expect"]).expect, "time": __import__("time")})
        return {"step": step_name, "status": "passed"}
    except Exception as e:
        return {"step": step_name, "status": "failed", "error": str(e)[:500]}
    finally:
        if is_wait_step:
            page.set_default_timeout(10000)


def _indent(code: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(prefix + line for line in code.splitlines()) + "\n"


def _clean_step_code(raw: str) -> str:
    """清理 LLM 返回的代码"""
    code = raw.strip()
    if "```" in code:
        match = re.search(r"```(?:python)?\s*\n(.*?)```", code, re.DOTALL)
        if match:
            code = match.group(1).strip()
    lines = []
    for line in code.splitlines():
        stripped = line.strip()
        if any(stripped.startswith(p) for p in ("import ", "from ", "def ", "async def ", "class ", "with sync_playwright", "browser =", "browser.", "context =", "context.", "page = browser", "page = context")):
            continue
        if stripped.startswith("```"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _classify_failure(llm_complete, action: str, error: str, snapshot: str) -> str:
    """分类失败原因"""
    if llm_complete is None:
        return "script_bug"
    try:
        prompt = f"""分析以下 Playwright 测试失败的原因类型。只输出一个分类词，不要其他内容。

操作: {action[:200]}
错误: {error[:500]}
页面状态: {snapshot[:500]}

分类选项（只选一个）:
- script_bug — 选择器或代码写法错误
- system_bug — 系统功能本身有 bug（按钮不响应、页面 500 等）
- case_expired — 页面结构已变，用例步骤需要更新
- dependency — 缺少前置数据或外部依赖"""
        resp = llm_complete(prompt).strip().lower()
        for t in ("script_bug", "system_bug", "case_expired", "dependency"):
            if t in resp:
                return t
        return "script_bug"
    except Exception:
        return "script_bug"


def _assemble_script(func_name: str, fixture_name: str, code_blocks: list[str]) -> str:
    """拼接完整脚本"""
    lines = [
        "import pytest",
        "from playwright.sync_api import Page, expect",
        "from tea_step import tea_step",
        "",
        "",
        f"def {func_name}({fixture_name}: Page):",
        f'    page = {fixture_name}',
        "",
    ]
    for block in code_blocks:
        lines.append(block)
    return "\n".join(lines)
