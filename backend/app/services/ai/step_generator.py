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
        if login_result["status"] == "failed":
            browser.close()
            return {"script": "", "results": results, "all_passed": False}

        # 逐步骤生成
        for i, step in enumerate(steps):
            action = step.get("action", "")
            expected = step.get("expected", "")
            if not action:
                continue

            # 1. 拿当前页面 snapshot
            try:
                snapshot = page.locator("body").aria_snapshot()[:3000]
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

            if exec_result["status"] == "failed":
                # 重新拿当前页面 snapshot（可能已经导航到新页面）
                try:
                    page.wait_for_load_state("domcontentloaded")
                    current_snapshot = page.locator("body").aria_snapshot()[:3000]
                except Exception:
                    current_snapshot = snapshot
                # 尝试修复一次
                fix_code = _fix_one_step(
                    llm_complete=llm_complete,
                    action=action,
                    original_code=step_code,
                    error=exec_result.get("error", ""),
                    snapshot=current_snapshot,
                )
                if fix_code and fix_code != step_code:
                    fix_result = _execute_step(page, fix_code, f"{action}（修复后）")
                    fix_result["code"] = fix_code
                    if fix_result["status"] == "passed":
                        results[-1] = fix_result
                        code_blocks[-1] = f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(fix_code, 8)
                    else:
                        break
                else:
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
    prompt = f"""你是 Playwright 代码生成器。根据当前页面状态，生成执行下面这一步操作的 Python 代码。

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

## 规则
- 只输出纯 Python 代码（2-5 行），不要函数定义、不要 import、不要 markdown
- 变量名固定用 `page`
- 用 get_by_role / get_by_text / get_by_label 定位，名称从 Aria Snapshot 中查找
- 禁止 get_by_placeholder、禁止 CSS 选择器
- 操作后加 page.wait_for_load_state("domcontentloaded")
- 如果是验证步骤，用 expect(...).to_be_visible() 或 .to_contain_text()
- 下拉菜单、弹窗项用 get_by_text(精确文字).click()"""

    if llm_complete is None:
        return f'page.get_by_text("{action[:20]}").click()\npage.wait_for_load_state("domcontentloaded")'

    try:
        resp = llm_complete(prompt)
        code = resp.strip()
        if "```" in code:
            match = re.search(r"```(?:python)?\s*\n(.*?)```", code, re.DOTALL)
            if match:
                code = match.group(1).strip()
        for pat in (r"^import ", r"^from ", r"^def "):
            code = re.sub(pat + r".*\n?", "", code, flags=re.MULTILINE)
        return code.strip()
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
{snapshot}
```

规则: 用 get_by_role / get_by_text / get_by_label，名称从 Snapshot 查找。禁止 get_by_placeholder。"""

    try:
        resp = llm_complete(prompt)
        code = resp.strip()
        if "```" in code:
            match = re.search(r"```(?:python)?\s*\n(.*?)```", code, re.DOTALL)
            if match:
                code = match.group(1).strip()
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
