"""逐步生成引擎 — 一步一步生成+执行 Playwright 代码，每步都基于真实页面状态"""
from __future__ import annotations

import json
import logging
import re

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
    preconditions: str = "",
    cached_steps: dict | None = None,
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
        browser = p.chromium.launch(headless=True, timeout=30000)
        context = browser.new_context(locale="zh-CN", viewport={"width": 1280, "height": 720})
        page = context.new_page()
        page.set_default_timeout(10000)

        # 拦截 HTTP 请求（接口流量提取）
        captured_requests = []
        pending_requests = {}

        def on_request(request):
            try:
                if "/api/" in request.url:
                    body = None
                    try:
                        body = request.post_data[:500] if request.post_data else None
                    except Exception:
                        pass
                    pending_requests[request.url + request.method] = {
                        "method": request.method,
                        "url": request.url,
                        "path": request.url.split("//", 1)[-1].split("/", 1)[-1] if "//" in request.url else request.url,
                        "resource_type": request.resource_type,
                        "post_data": body,
                        "status": 0,
                    }
            except Exception:
                pass

        def on_response(response):
            try:
                req = response.request
                key = req.url + req.method
                if key in pending_requests:
                    pending_requests[key]["status"] = response.status
                    captured_requests.append(pending_requests.pop(key))
            except Exception:
                pass

        page.on("request", on_request)
        page.on("response", on_response)

        # 登录
        login_result = _do_login(page, base_url, credentials)
        results.append(login_result)
        if on_step:
            on_step({"type": "step_done", "action": login_result["step"], "status": login_result["status"], "seq": 0})
        if login_result["status"] == "failed":
            browser.close()
            return {"script": "", "results": results, "all_passed": False, "healing_records": healing_records}

        # 前置准备 — 如果步骤中有"创建"操作，生成唯一名称避免冲突
        import time as _time
        unique_suffix = str(int(_time.time()))[-6:]
        created_name = None
        has_create_step = any("创建" in s.get("action", "") or "新建" in s.get("action", "") for s in steps)
        if has_create_step:
            for step in steps:
                action = step.get("action", "")
                if "服务名称" in action or "名称" in action:
                    import re as _re
                    name_match = _re.search(r'(?:服务名称|名称).+?输入\s+([a-zA-Z0-9_-]+)', action)
                    if name_match:
                        created_name = f"{name_match.group(1)}-{unique_suffix}"
                    break

        if on_step and created_name:
            on_step({"type": "step_done", "seq": -1, "action": f"[前置] 使用唯一名称: {created_name}", "status": "passed"})
        results.append({"step": f"[前置] 唯一名称: {created_name or '无创建操作'}", "status": "passed"})

        # 前置条件分析 → 生成 setup 步骤
        if preconditions:
            setup_steps = _analyze_preconditions(llm_complete, preconditions, base_url, page)
            for setup in setup_steps:
                if on_step:
                    on_step({"type": "step_start", "seq": -1, "action": setup["action"], "phase": "setup"})
                setup_result = _execute_step(page, setup["code"], f"[前置] {setup['action']}")
                results.append(setup_result)
                code_blocks.append(f'    # Setup: {setup["action"]}\n    with tea_step("[前置] {setup["action"][:40]}", phase="setup"):\n' + _indent(setup["code"], 8))
                if on_step:
                    on_step({"type": "step_done", "seq": -1, "action": f"[前置] {setup['action']}", "status": setup_result["status"]})
                if setup_result["status"] == "failed":
                    break

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

            # 2. 检查缓存 — 之前通过的代码直接用
            cache_key = str(i + 1)
            cached_code = (cached_steps or {}).get(cache_key)
            if cached_code:
                cache_result = _execute_step(page, cached_code, f"{action}（缓存）")
                if cache_result["status"] == "passed":
                    results.append(cache_result)
                    code_blocks.append(f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(cached_code, 8))
                    if on_step:
                        on_step({"type": "step_done", "seq": i + 1, "action": f"{action}（缓存）", "status": "passed"})
                    continue
                # 缓存失效，走正常生成

            # 3. 查历史修复记录
            history_hint = ""
            if healing_history:
                relevant = [h for h in healing_history if h.get("step_seq") == i + 1 or h.get("page_url") == page.url]
                if relevant:
                    failed_codes = [h["original_code"] for h in relevant if not h.get("resolved")]
                    if failed_codes:
                        history_hint = "\n以下代码在之前尝试中失败过，请避免类似写法：\n" + "\n".join(f"- {c[:100]}" for c in failed_codes[:3])

            # 3. LLM 生成这一步的代码
            actual_action = action
            if created_name and ("输入" in action and ("名称" in action or "名" in action)):
                actual_action = action + f"\n注意：使用唯一名称 '{created_name}' 替代用例中的原始名称"
            step_code = _generate_one_step(
                llm_complete=llm_complete,
                step_num=i + 1,
                action=actual_action,
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
                current_snapshot = snapshot  # 初始化为当前 snapshot
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
                    failure_type = _classify_failure(llm_complete, action, last_error, current_snapshot)
                    healing_records.append({
                        "step_seq": i + 1, "step_action": action[:500], "page_url": page.url,
                        "failure_type": failure_type,
                        "original_code": step_code, "error_summary": last_error[:2000],
                        "fix_code": None, "fix_method": "all_attempts_failed",
                        "page_snapshot": current_snapshot[:2000],
                        "resolved": False,
                    })
                    if on_step:
                        on_step({"type": "step_done", "seq": i + 1, "action": action, "status": "failed", "error": last_error[:200], "failure_type": failure_type})
                    break

        # 后置清理 — 删除本次测试创建的数据
        all_main_passed = all(r["status"] == "passed" for r in results if "[前置]" not in r.get("step", ""))
        if created_name and all_main_passed:
            if on_step:
                on_step({"type": "step_start", "seq": 999, "action": f"[后置清理] 删除测试数据 {created_name}", "phase": "teardown"})
            try:
                snapshot = page.locator("body").aria_snapshot()[:6000]
                teardown_code = _generate_one_step(
                    llm_complete=llm_complete, step_num=999,
                    action=f"导航到服务管理列表页，找到名称含 '{created_name}' 的服务并删除它",
                    expected="服务被删除", snapshot=snapshot, page_url=page.url,
                )
                teardown_result = _execute_step(page, teardown_code, f"[后置清理] 删除 {created_name}")
                results.append(teardown_result)
                code_blocks.append(f'    # Teardown\n    with tea_step("[后置清理] 删除 {created_name}", phase="teardown"):\n' + _indent(teardown_code, 8))
                if on_step:
                    on_step({"type": "step_done", "seq": 999, "action": f"[后置清理] 删除 {created_name}", "status": teardown_result["status"]})
            except Exception:
                pass

        # 把未收到 response 的 pending 请求也加到 captured
        for req_data in pending_requests.values():
            captured_requests.append(req_data)

        browser.close()
    script = _assemble_script(func_name, fixture_name, code_blocks)
    all_passed = all(r["status"] == "passed" for r in results)

    # 收集通过步骤的缓存
    step_cache = {}
    for r in results:
        if r.get("status") == "passed" and r.get("code"):
            seq = r.get("seq") or str(results.index(r))
            step_cache[str(seq)] = r["code"]

    return {"script": script, "results": results, "all_passed": all_passed, "healing_records": healing_records, "captured_requests": captured_requests, "step_cache": step_cache}


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

## 结果验证（重要！）
操作步骤（点击按钮/提交表单）后**必须验证结果**：
- 创建/提交后: 检查是否出现成功 Toast 或页面跳转，如: `expect(page.locator("body")).not_to_contain_text("错误")` + `page.wait_for_url("**/不是原来的路径**")`
- 如果页面还在原来的 URL 或出现错误提示 → 操作失败

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
        # 等待网络请求完成
        try:
            page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass
        # 检查页面是否有明确的错误提示（防止假通过）
        try:
            error_toast = page.locator(".ant-message-error").first
            if error_toast.is_visible(timeout=300):
                error_text = error_toast.inner_text()[:200]
                return {"step": step_name, "status": "failed", "error": f"页面错误提示: {error_text}"}
        except Exception:
            pass
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


def _analyze_preconditions(llm_complete, preconditions: str, base_url: str, page) -> list[dict]:
    """分析前置条件，生成 setup 步骤（如果需要通过 UI 操作准备数据）"""
    # 跳过不需要准备的常见前置条件
    skip_keywords = ["已登录", "登录", "账号", "权限", "管理员", "租户", "授权", "集群", "网关", "已存在", "已创建", "存在至少", "已配置"]
    lines = [l.strip() for l in preconditions.split("\n") if l.strip()]
    needs_setup = []
    for line in lines:
        # 去掉编号前缀
        clean = re.sub(r'^\d+[\.\、\s]+', '', line)
        if any(kw in clean for kw in skip_keywords):
            continue
        needs_setup.append(clean)

    if not needs_setup:
        return []

    # 先检查页面上是否已有数据——如果能看到相关内容就跳过
    try:
        body_text = page.inner_text("body")[:2000] if page else ""
    except Exception:
        body_text = ""

    # 简单检查：如果页面上有服务/数据/表格行，大概率条件已满足
    if any(kw in body_text for kw in ["运行中", "已下线", "服务总数", "负载配置", "条 ·"]):
        return []

    # 让 LLM 判断
    try:
        snapshot = page.locator("body").aria_snapshot()[:3000]
    except Exception:
        snapshot = ""

    try:
        prompt = f"""分析以下前置条件，判断哪些需要通过操作来准备数据。

前置条件:
{chr(10).join(needs_setup)}

当前页面状态:
{snapshot[:1500]}

如果前置条件中的数据可能不存在（如"已存在至少一个服务"），生成准备数据的操作步骤。
如果数据已经存在（页面上能看到），输出 SKIP。

对每个需要准备的条件，输出一行 JSON:
{{"action": "操作描述", "code": "page.xxx 调用代码"}}

如果所有条件都已满足，只输出 SKIP"""

        resp = llm_complete(prompt).strip()
        if "SKIP" in resp.upper():
            return []

        setup_steps = []
        for line in resp.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    data = json.loads(line)
                    if data.get("action") and data.get("code"):
                        code = _clean_step_code(data["code"])
                        if code:
                            setup_steps.append({"action": data["action"], "code": code})
                except Exception:
                    pass
        return setup_steps[:3]  # 最多 3 个 setup 步骤
    except Exception as e:
        logger.warning("前置条件分析失败: %s", e)
        return []


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
