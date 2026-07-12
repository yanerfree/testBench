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
            on_step({"type": "step_done", "step": login_result["step"], "status": login_result["status"], "seq": 0})
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

            # 2. LLM 生成这一步的代码
            step_code = _generate_one_step(
                llm_complete=llm_complete,
                step_num=i + 1,
                action=action,
                expected=expected,
                snapshot=snapshot,
                page_url=page.url,
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
                        if on_step:
                            on_step({"type": "step_done", "seq": i + 1, "action": f"{action}（修复第{fix_attempt+1}次）", "status": "passed"})
                        break
                    else:
                        last_error = fix_result.get("error", "")
                        step_code = fix_code

                if not fixed:
                    if on_step:
                        on_step({"type": "step_done", "seq": i + 1, "action": action, "status": "failed", "error": last_error[:200]})
                    break

        browser.close()

    # 拼接完整脚本
    script = _assemble_script(func_name, fixture_name, code_blocks)
    all_passed = all(r["status"] == "passed" for r in results)

    return {"script": script, "results": results, "all_passed": all_passed}


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


def _generate_one_step(llm_complete, step_num: int, action: str, expected: str, snapshot: str, page_url: str) -> str:
    """调 LLM 生成单个步骤的 Playwright 代码"""
    prompt = f"""你是 Playwright 代码生成器。根据当前页面的 Aria Snapshot，生成执行操作的 Python 代码。

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
1. 看到 `textbox "xxx"` → 用 `page.get_by_role("textbox", name="xxx")`
2. 看到 `button "xxx"` → 用 `page.get_by_role("button", name="xxx")`
3. 看到 `heading "xxx"` → 用 `page.get_by_role("heading", name="xxx")`
4. 看到 `link "xxx"` → 用 `page.get_by_role("link", name="xxx")`
5. 下拉菜单/弹窗中的临时选项 → 用 `page.get_by_text("文字").click()`
6. 匹配多个元素时加 `.first` 或 `.nth(0)`
7. **禁止 get_by_label、get_by_placeholder、CSS 选择器**
8. 选择下拉框选项：先 `page.get_by_text("请选择…").click()` 打开，再 `page.get_by_text("选项名").click()` 选择
9. 不要用 `get_by_role("option")`，自定义下拉组件没有 option 角色

## 输出（严格遵守）
只输出 2-5 行 page.xxx 调用代码。不要 import/函数定义/sync_playwright/markdown。
正确示例:
page.get_by_text("服务管理").click()
page.wait_for_load_state("networkidle")
"""

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

    prompt = f"""修复以下 Playwright 代码。只输出修复后的代码（2-5 行），不要其他内容。

原代码:
{original_code}

错误:
{error}

当前页面 Aria Snapshot:
```yaml
{snapshot[:2000]}
```

修复规则:
- 用 get_by_role / get_by_text，名称从 Snapshot 查找
- 禁止 get_by_placeholder、get_by_label、CSS 选择器
- 不要用 get_by_role("option")，自定义下拉没有 option 角色
- 选择下拉选项：page.get_by_text("请选择…").click() → page.get_by_text("选项名").click()
- strict mode violation → 加 .first 或用更精确的文字匹配
- timeout 找不到 → 换 Snapshot 中存在的元素"""

    try:
        resp = llm_complete(prompt)
        code = _clean_step_code(resp)
        return code.strip() or None
    except Exception:
        return None


def _execute_step(page, code: str, step_name: str) -> dict:
    """在浏览器中执行一段代码"""
    try:
        exec(code, {"page": page, "expect": __import__("playwright.sync_api", fromlist=["expect"]).expect, "time": __import__("time")})
        return {"step": step_name, "status": "passed"}
    except Exception as e:
        return {"step": step_name, "status": "failed", "error": str(e)[:500]}


def _indent(code: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(prefix + line for line in code.splitlines()) + "\n"


def _clean_step_code(raw: str) -> str:
    """清理 LLM 返回的代码——去掉 markdown/import/函数定义/类定义"""
    code = raw.strip()
    if "```" in code:
        match = re.search(r"```(?:python)?\s*\n(.*?)```", code, re.DOTALL)
        if match:
            code = match.group(1).strip()
    # 删除不需要的行
    lines = []
    for line in code.splitlines():
        stripped = line.strip()
        if any(stripped.startswith(p) for p in ("import ", "from ", "def ", "async def ", "class ", "with sync_playwright", "browser =", "browser.", "context =", "context.", "page = browser", "page = context")):
            continue
        if stripped.startswith("```"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


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
