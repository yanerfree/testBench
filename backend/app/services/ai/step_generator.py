"""逐步生成引擎 — 一步一步生成+执行 Playwright 代码，每步都基于真实页面状态"""
from __future__ import annotations

import json
import logging
import re

import httpx

logger = logging.getLogger(__name__)


def _llm_complete_sync(prompt: str, max_tokens: int = 500, system: str = "") -> str:
    """同步调用 LLM"""
    from app.services.ai.llm_client import _build_headers, _get_endpoint, _get_extra_headers, _build_openai_body

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    body = _build_openai_body(
        messages,
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
    headless: bool = False,
    alt_credentials: dict[str, str] | None = None,
    setup_refs: list[dict] | None = None,
    cancel_event=None,
    step_hints: dict | None = None,
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
        browser = p.chromium.launch(headless=headless, timeout=30000)
        # 接口流量提取 — 用 HAR 录制（最可靠）
        import tempfile as _tempfile
        har_path = _tempfile.mktemp(suffix=".har")
        context = browser.new_context(
            locale="zh-CN", viewport={"width": 1280, "height": 720},
            record_har_path=har_path,
        )
        page = context.new_page()
        page.set_default_timeout(10000)

        # 多角色检测 — 步骤中是否有角色标记
        multi_role = _detect_multi_role(steps)
        alt_page = None

        # 登录主角色
        login_result = _do_login(page, base_url, credentials)
        results.append(login_result)
        if on_step:
            on_step({"type": "step_done", "action": login_result["step"], "status": login_result["status"], "seq": 0})
        if login_result["status"] == "failed":
            browser.close()
            return {"script": "", "results": results, "all_passed": False, "healing_records": healing_records}

        # 多角色：创建第二个 context 登录备用角色
        if multi_role and alt_credentials:
            alt_context = browser.new_context(
                locale="zh-CN", viewport={"width": 1280, "height": 720},
            )
            alt_page = alt_context.new_page()
            alt_page.set_default_timeout(10000)
            alt_login = _do_login(alt_page, base_url, alt_credentials)
            results.append(alt_login)
            if on_step:
                on_step({"type": "step_done", "action": f"[备用角色] {alt_login['step']}", "status": alt_login["status"], "seq": 0})
            if alt_login["status"] == "failed":
                logger.warning("备用角色登录失败，降级为单角色模式")
                alt_page = None

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

        new_setup_refs = []
        # 前置条件分析 → 生成 setup 步骤
        if preconditions:
            setup_steps, new_setup_refs = _analyze_preconditions(llm_complete, preconditions, base_url, page, setup_refs=setup_refs)
            for setup in setup_steps:
                if on_step:
                    on_step({"type": "step_start", "seq": -1, "action": setup["action"], "phase": "setup"})
                setup_result = _execute_step(page, setup["code"], f"[前置] {setup['action']}")
                results.append(setup_result)
                code_blocks.append(f'    # Setup: {setup["action"]}\n    with tea_step("[前置] {setup["action"][:40]}", phase="setup"):\n' + _indent(setup["code"], 8))
                if on_step:
                    on_step({"type": "step_done", "seq": -1, "action": f"[前置] {setup['action']}", "status": setup_result["status"]})
                if setup_result["status"] == "failed":
                    logger.warning("前置数据检查失败，继续执行主步骤: %s", setup['action'][:50])

        # 逐步骤生成
        for i, step in enumerate(steps):
            if cancel_event and cancel_event.is_set():
                results.append({'step': '[已取消]', 'status': 'failed', 'error': '用户取消'})
                break
            action = step.get("action", "")
            expected = step.get("expected", "")
            if not action:
                continue

            # 多角色切换 — 根据步骤文字选择对应的 page
            current_page = page
            if alt_page:
                step_role = _detect_step_role(action, fixture_name)
                if step_role == "alt":
                    current_page = alt_page

            # 检测是否需要拆成"打开下拉+选择"两步
            is_select_step = any(kw in action for kw in ["下拉", "选择", "请选择"])

            # 1. 拿当前页面 snapshot
            if on_step:
                on_step({"type": "step_start", "seq": i + 1, "action": action, "phase": "generating"})
            try:
                current_page.wait_for_timeout(500)
                snapshot = current_page.locator("body").aria_snapshot()[:12000]
            except Exception:
                snapshot = ""

            # 2. 检查缓存 — 之前通过的代码直接用
            cache_key = str(i + 1)
            cached_code = (cached_steps or {}).get(cache_key)
            if cached_code:
                cache_result = _execute_step(current_page, cached_code, f"{action}（缓存）")
                if cache_result["status"] == "passed":
                    results.append(cache_result)
                    code_blocks.append(f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(cached_code, 8))
                    if on_step:
                        on_step({"type": "step_done", "seq": i + 1, "action": f"{action}（缓存）", "status": "passed"})
                    continue
                # 缓存失效，走正常生成

            # 3. 查历史修复记录 — 构造结构化经验
            history_hint = ""
            if healing_history:
                relevant = [h for h in healing_history if h.get("step_seq") == i + 1 or h.get("page_url") == current_page.url]
                if relevant:
                    # 已修复的教训（成功经验）
                    resolved = [h for h in relevant if h.get("resolved")]
                    if resolved:
                        lessons = []
                        for h in resolved[:3]:
                            err = h.get("error_summary", "")[:80]
                            fix = h.get("fix_code", "")[:80]
                            lessons.append(f"- {h.get('step_action', '')[:40]}: {err} → 修复为: {fix}")
                        history_hint += "\n## 历史教训（已成功修复的经验）\n" + "\n".join(lessons)

                    # 未修复的失败代码（避免重复）
                    unresolved = [h for h in relevant if not h.get("resolved")]
                    if unresolved:
                        failed_codes = [h["original_code"][:100] for h in unresolved[:3] if h.get("original_code")]
                        if failed_codes:
                            history_hint += "\n## 失败过的代码（必须避免）\n" + "\n".join(f"- {c}" for c in failed_codes)

            # 3. LLM 生成这一步的代码
            actual_action = action
            hint = (step_hints or {}).get(str(i + 1)) or (step_hints or {}).get(str(i))
            if hint:
                actual_action += "\n用户指导：" + hint
            if created_name and ("输入" in action and ("名称" in action or "名" in action)):
                actual_action = action + f"\n注意：使用唯一名称 '{created_name}' 替代用例中的原始名称"
            step_code = _generate_one_step(
                llm_complete=llm_complete,
                step_num=i + 1,
                action=actual_action,
                expected=expected,
                snapshot=snapshot,
                page_url=current_page.url,
                history_hint=history_hint,
            )

            # 3. 静态校验（零 token，拦截明显错误）— 最多重试 3 次
            is_action_step = any(kw in action for kw in ["点击", "填写", "输入", "选择", "配置", "创建", "新建", "编辑", "删除", "保存", "发布", "提交"])
            for _retry in range(3):
                validation_error = _validate_step_code(step_code, snapshot)
                # 操作类步骤必须有 click/fill 等操作，不能只有 expect
                if not validation_error and is_action_step:
                    action_ops = [".click(", ".fill(", ".goto(", ".press(", ".check(", ".type(", ".select_option("]
                    if not any(op in step_code for op in action_ops):
                        validation_error = f"操作类步骤（{action[:20]}）必须包含 click/fill 等操作，不能只有 expect 断言"
                if not validation_error:
                    break
                logger.info("步骤 %d 静态校验失败(第%d次): %s，重新生成", i + 1, _retry + 1, validation_error)
                step_code = _generate_one_step(
                    llm_complete=llm_complete, step_num=i + 1,
                    action=actual_action, expected=expected, snapshot=snapshot, page_url=current_page.url,
                    history_hint=history_hint + f"\n上次生成的代码未通过静态校验: {validation_error}\n必须包含 click/fill/expect 等操作性调用，不能只有 wait_for_load_state",
                )

            # 3.5 静态校验兜底——3 次重试后仍无效则标记失败
            if validation_error:
                logger.warning("步骤 %d 静态校验 3 次重试仍失败: %s", i + 1, validation_error)
                results.append({"step": action, "status": "failed", "error": f"代码生成质量不足: {validation_error}", "code": step_code})
                if on_step:
                    on_step({"type": "step_done", "seq": i + 1, "action": action, "status": "failed", "error": validation_error[:200]})
                break

            # 4. 执行前选择器唯一性验证（纯机械，不调 LLM）
            step_code = _pre_verify_and_fix_locators(current_page, step_code)

            # 5. 执行
            exec_result = _execute_step(current_page, step_code, action)
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
                        current_page.wait_for_timeout(500)
                        new_snap = current_page.locator("body").aria_snapshot()[:12000]
                        # 只在 Snapshot 中确实有下拉列表（listbox/combobox/option）时才触发
                        if any(kw in new_snap for kw in ["listbox", "option", "combobox"]):
                            select_code = _generate_one_step(
                                llm_complete=llm_complete, step_num=i + 1,
                                action=f"在已打开的下拉列表中选择第一个可用选项",
                                expected="选中选项", snapshot=new_snap, page_url=current_page.url,
                            )
                            select_result = _execute_step(current_page, select_code, f"{action}（选择选项）")
                            if select_result["status"] == "passed":
                                code_blocks[-1] += _indent(select_code, 8)
                    except Exception:
                        pass

            elif exec_result["status"] == "failed":
                # 尝试修复，最多 3 次
                fixed = False
                initial_error = exec_result.get("error", "")
                initial_code = step_code
                last_error = initial_error
                current_snapshot = snapshot
                for fix_attempt in range(5):
                    try:
                        current_page.wait_for_load_state("domcontentloaded")
                        current_snapshot = current_page.locator("body").aria_snapshot()[:12000]
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

                    fix_result = _execute_step(current_page, fix_code, f"{action}（修复第{fix_attempt+1}次）")
                    if fix_result["status"] == "passed":
                        fix_result["code"] = fix_code
                        results[-1] = fix_result
                        code_blocks[-1] = f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(fix_code, 8)
                        fixed = True
                        healing_records.append({
                            "step_seq": i + 1, "step_action": action[:500], "page_url": current_page.url,
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
                    # 最后补救：strict mode violation 自动加 .first
                    all_errors = initial_error + " " + last_error
                    if "strict mode violation" in all_errors:
                        for patch_target in [initial_code, step_code]:
                            if not patch_target or patch_target.strip().startswith("raise"):
                                continue
                            patched = re.sub(
                                r'(\.get_by_text\([^)]+\))(\.(click|check|uncheck|fill)\()',
                                r'\1.first\2', patch_target
                            )
                            if patched == patch_target:
                                patched = re.sub(
                                    r'(\.get_by_role\([^)]+\))(\.(click|check|uncheck|fill)\()',
                                    r'\1.first\2', patch_target
                                )
                            if patched != patch_target:
                                logger.info("步骤 %d: strict mode 自动补丁 .first", i + 1)
                                patch_result = _execute_step(current_page, patched, f"{action}（auto .first）")
                                if patch_result["status"] == "passed":
                                    patch_result["code"] = patched
                                    results[-1] = patch_result
                                    code_blocks[-1] = f'    # Step {i+1}: {action}\n    with tea_step("{action[:50]}", phase="{"verify" if "验证" in action else "action"}"):\n' + _indent(patched, 8)
                                    fixed = True
                                    healing_records.append({
                                        "step_seq": i + 1, "step_action": action[:500], "page_url": current_page.url,
                                        "original_code": initial_code, "error_summary": initial_error[:2000],
                                        "fix_code": patched, "fix_method": "auto_first_patch",
                                        "page_snapshot": current_snapshot[:2000], "resolved": True,
                                    })
                                    if on_step:
                                        on_step({"type": "step_done", "seq": i + 1, "action": f"{action}（auto .first）", "status": "passed"})
                                    break

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

        # 后置清理 — 通过 API 删除创建的服务
        all_main_passed = all(r["status"] == "passed" for r in results if "[前置]" not in r.get("step", ""))
        if created_name and all_main_passed:
            if on_step:
                on_step({"type": "step_start", "seq": 999, "action": f"[后置清理] 删除 {created_name}", "phase": "teardown"})
            try:
                cleanup_code = f'''
result = page.evaluate("""async () => {{
    try {{
        const resp = await fetch('/api/v1/services?page_size=100');
        const data = await resp.json();
        const items = data.data || data.items || [];
        const target = items.find(s => s.name && s.name.includes('{created_name}'));
        if (target) {{
            await fetch('/api/v1/services/' + target.id, {{ method: 'DELETE' }});
            return 'deleted: ' + target.name;
        }}
        return 'not found';
    }} catch(e) {{ return 'error: ' + e.message; }}
}}""")
'''
                teardown_result = _execute_step(page, cleanup_code, f"[后置清理] 删除 {created_name}")
                results.append(teardown_result)
                if on_step:
                    on_step({"type": "step_done", "seq": 999, "action": f"[后置清理] 删除 {created_name}", "status": teardown_result["status"]})
            except Exception:
                results.append({"step": f"[后置清理] 删除 {created_name}", "status": "failed", "error": "清理异常"})

        # 从 HAR 读取捕获的接口请求
        captured_requests = []
        context.close()  # 关闭 context 才能写入 HAR
        try:
            import os as _os
            if _os.path.exists(har_path):
                with open(har_path) as f:
                    har_data = json.load(f)
                for entry in har_data.get("log", {}).get("entries", []):
                    req = entry.get("request", {})
                    resp = entry.get("response", {})
                    url = req.get("url", "")
                    if "/api/" in url:
                        post_data = None
                        if req.get("postData", {}).get("text"):
                            post_data = req["postData"]["text"][:500]
                        captured_requests.append({
                            "method": req.get("method", "GET"),
                            "url": url,
                            "path": url.split("//", 1)[-1].split("/", 1)[-1] if "//" in url else url,
                            "status": resp.get("status", 0),
                            "post_data": post_data,
                        })
                _os.unlink(har_path)
        except Exception:
            pass

        browser.close()
    script = _assemble_script(func_name, fixture_name, code_blocks)
    # all_passed 只看主步骤（前置/后置失败不影响判定）
    main_results = [r for r in results if "[前置]" not in r.get("step", "") and "[后置" not in r.get("step", "")]
    all_passed = bool(main_results) and all(r["status"] == "passed" for r in main_results)

    # 收集通过步骤的缓存
    step_cache = {}
    for r in results:
        if r.get("status") == "passed" and r.get("code"):
            seq = r.get("seq") or str(results.index(r))
            step_cache[str(seq)] = r["code"]

    return {"script": script, "results": results, "all_passed": all_passed, "healing_records": healing_records, "captured_requests": captured_requests, "step_cache": step_cache, "new_setup_refs": new_setup_refs if preconditions else []}


def _detect_multi_role(steps: list[dict]) -> bool:
    """检测步骤列表中是否涉及多个角色"""
    role_keywords = {
        "admin": ["管理员", "admin", "[管理员]", "平台管理员"],
        "tenant": ["租户", "tenant", "[租户]", "租户管理员"],
    }
    found_roles = set()
    for step in steps:
        action = step.get("action", "").lower()
        for role, keywords in role_keywords.items():
            if any(kw.lower() in action for kw in keywords):
                found_roles.add(role)
    # 额外检查：新窗口/新浏览器/切换账号
    all_text = " ".join(s.get("action", "") for s in steps)
    if any(kw in all_text for kw in ["新窗口", "新浏览器", "切换账号", "另一个账号", "新的浏览器"]):
        return True
    return len(found_roles) > 1


def _detect_step_role(action: str, primary_fixture: str) -> str:
    """判断单步属于主角色还是备用角色。返回 'primary' 或 'alt'"""
    action_lower = action.lower()
    # 显式角色标记
    if any(kw in action_lower for kw in ["[管理员]", "平台管理员", "admin"]):
        return "primary" if primary_fixture == "logged_in_page" else "alt"
    if any(kw in action_lower for kw in ["[租户]", "租户管理员", "tenant"]):
        return "primary" if primary_fixture == "tenant_page" else "alt"
    # 新窗口/新账号 → 备用角色
    if any(kw in action for kw in ["新窗口", "新浏览器", "切换账号", "另一个账号", "新的浏览器", "被邀请人"]):
        return "alt"
    return "primary"


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
        # SPA 可能还在渲染——等导航菜单出现
        try:
            page.locator("nav").wait_for(state="visible", timeout=10000)
        except Exception:
            page.wait_for_timeout(3000)
        return {"step": f"登录系统（{username}）", "status": "passed"}
    except Exception as e:
        return {"step": "登录系统", "status": "failed", "error": str(e)[:300]}


STEP_SYSTEM_PROMPT = """你是 Playwright 代码生成器。根据页面 Aria Snapshot 生成 Python 代码。

## ⚠️ 最重要规则：Aria Snapshot 是唯一真相源
Snapshot 显示页面上实际存在的元素。步骤描述只是"意图"。冲突时以 Snapshot 为准。
举例：步骤说"成员管理"但 Snapshot 只有 `text: 用户管理` → 用 `page.get_by_text("用户管理")`

## 选择器规则
1. `textbox "xxx"` → `page.get_by_role("textbox", name="xxx")`
2. `button "xxx"` → `page.get_by_role("button", name="xxx")`
3. `heading "xxx"` → `page.get_by_role("heading", name="xxx")`
4. `link "xxx"` → `page.get_by_role("link", name="xxx")`
5. `checkbox "xxx"` → `page.get_by_role("checkbox", name="xxx")`
6. 匹配多个 → 加 `.first`
7. 下拉/弹窗选项 → `page.get_by_text("文字").click()`

## 表格操作
- 点行: `page.get_by_role("row", name="关键词").click()`
- 行内按钮: `page.get_by_role("row", name="关键词").get_by_role("button").click()`
- 搜索: `page.get_by_role("textbox", name="搜索...").fill("关键词")`

## 弹窗操作
有 `dialog` 时用 `page.get_by_role("dialog").get_by_xxx()` 限定范围

## 复制地址/访问URL
如果步骤说"复制地址并访问"或"在浏览器访问"：
1. 用 page.evaluate 提取包含 http 的文本: `url = page.evaluate("() => [...document.querySelectorAll('*')].find(e => e.textContent.match(/https?:\/\/[^\\s]+/) && e.children.length === 0)?.textContent.match(/https?:\/\/[^\\s]+/)?.[0]")`
2. 如果找到 URL: `page.goto(url)` + `page.wait_for_load_state("networkidle")`
3. 如果找不到，验证页面上有地址相关文字: `expect(page.locator("body")).to_contain_text("http")`

## 下拉菜单（Dropdown）操作
如果步骤说"选择XX"但 Snapshot 中没有对应的选项元素，说明下拉菜单还没展开。
此时应该先找到触发下拉的按钮并 click，等 500ms，再 click 选项：
```
page.get_by_role("button", name="创建服务").click()
page.wait_for_timeout(500)
page.get_by_text("API 服务").click()
```
下拉选项可能在 Snapshot 中不可见（动态渲染），直接用 get_by_text 定位。

## 禁止
❌ get_by_label / get_by_placeholder / CSS选择器 / get_by_role("option")
❌ import / def / class / async / 编造不存在的元素

## 验证类步骤
如果步骤是"观察"/"确认"/"验证"类（不需要点击操作），用 expect 断言：
- `expect(page.get_by_role("heading", name="xxx")).to_be_visible()`
- `expect(page.locator("body")).to_contain_text("xxx")`
注意：不要硬编码具体数字（如"服务总数 11"），用文字标签断言（如"服务总数"）。
不要输出分析文字，必须输出可执行的 expect/page 代码。

## 输出
只输出 2-6 行 page.xxx/expect(...) 调用，不要其他内容（不要中文解释）。"""


def _generate_one_step(llm_complete, step_num: int, action: str, expected: str, snapshot: str, page_url: str, history_hint: str = "") -> str:
    """调 LLM 生成单个步骤的 Playwright 代码"""
    prompt = f"""当前页面 URL: {page_url}
Aria Snapshot:
```yaml
{snapshot}
```

要执行的操作（意图，元素名可能不准确）: {action}
预期结果: {expected or "无"}
{history_hint}"""

    if llm_complete is None:
        return f'page.get_by_text("{action[:20]}").click()\npage.wait_for_load_state("domcontentloaded")'

    try:
        import inspect
        sig = inspect.signature(llm_complete)
        if 'system' in sig.parameters:
            resp = llm_complete(prompt, system=STEP_SYSTEM_PROMPT)
        else:
            resp = llm_complete(STEP_SYSTEM_PROMPT + "\n\n" + prompt)
        code = _clean_step_code(resp)
        if not code.strip() or code.strip() == "pass":
            return 'raise Exception("LLM 返回了空代码，无法执行此步骤")'
        return code
    except Exception as e:
        logger.warning("LLM 生成步骤 %d 失败: %s", step_num, e)
        return f'raise Exception("LLM 调用失败: {str(e)[:100]}")'


def _fix_one_step(llm_complete, action: str, original_code: str, error: str, snapshot: str) -> str | None:
    """调 LLM 修复一个步骤"""
    if llm_complete is None:
        return None

    prompt = f"""修复以下 Playwright 代码。只输出修复后的 2-6 行 page.xxx 调用代码。

## ⚠️ 最重要：Aria Snapshot 是唯一真相源
Snapshot 显示的是页面上**实际存在**的元素。原代码中使用的元素名称可能与实际不符。
修复时必须从 Snapshot 中找到**功能最匹配**的实际元素，而不是简单修改原代码的写法。

原代码:
{original_code}

错误:
{error}

当前页面 Aria Snapshot:
```yaml
{snapshot[:2000]}
```

修复规则:
- 从 Snapshot 找**实际存在**的元素的 role+name，用 get_by_role/get_by_text
- 如果原代码用的名称在 Snapshot 中不存在，找功能相近的元素（如"成员管理"不存在但有"用户管理"）
- ❌ 禁止: get_by_placeholder, get_by_label, CSS 选择器, get_by_role("option")
- **strict mode violation（同名元素多个）**→ 按以下顺序尝试：1) 用 `page.get_by_role("dialog").get_by_text("xxx")` 限定 dialog 范围 2) 加 `exact=True` 精确匹配 3) 加 `.first` 取第一个
- timeout → 换一个 Snapshot 中存在的元素
- 选择下拉: page.get_by_text("请选择…").click() → page.get_by_text("选项名").click()
- 不要输出 import/def/class/async/markdown
- **不要跳过原代码中的任何操作步骤**，每个操作都必须保留
- 角色/标签类选择器如果在 Snapshot 中是 text 而非独立元素，用 `get_by_text("名称", exact=True).first.click()`"""

    try:
        resp = llm_complete(prompt)
        code = _clean_step_code(resp)
        return code.strip() or None
    except Exception:
        return None


def _pre_verify_and_fix_locators(page, code: str) -> str:
    """在执行前验证选择器唯一性，自动修复 strict mode 问题（纯机械，不调 LLM）"""
    code = _clean_step_code(code)
    lines = code.splitlines()
    fixed_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            fixed_lines.append(line)
            continue

        # 提取 get_by_text("xxx") 或 get_by_role(..., name="xxx") 调用
        # 对于操作类调用（.click()/.fill()/.check()），验证选择器唯一性
        if ".click()" in stripped or ".fill(" in stripped or ".check()" in stripped:
            # 提取到 .click()/.fill()/.check() 之前的 locator 部分
            for action_method in [".click()", ".fill(", ".check()", ".uncheck()"]:
                if action_method in stripped:
                    locator_part = stripped.split(action_method)[0]
                    if ".first" in locator_part or ".nth(" in locator_part or ".last" in locator_part:
                        break
                    try:
                        count = eval(f"{locator_part}.count()", {"page": page})
                        if count > 1:
                            # 多个元素 → 自动加 .first
                            fixed_line = line.replace(action_method, f".first{action_method}", 1)
                            fixed_lines.append(fixed_line)
                            logger.info("选择器验证: %s 命中 %d 个元素，已加 .first", locator_part[:60], count)
                            break
                        elif count == 0:
                            logger.info("选择器验证: %s 命中 0 个元素，保持原样等执行报错", locator_part[:60])
                    except Exception:
                        pass
                    break
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)

    result = "\n".join(fixed_lines)
    return result if result != code else code


def _execute_step(page, code: str, step_name: str) -> dict:
    """在浏览器中执行一段代码"""
    # 全角字符兜底清理
    code = _clean_step_code(code)
    # 最终兜底：暴力删除常见全角标点（字符串外的）
    try:
        compile(code, "<exec_step>", "exec")
    except SyntaxError:
        # 暴力清除所有全角 ASCII 标点（U+FF00-FF5E 对应 ASCII 0x21-7E）
        cleaned = []
        for ch in code:
            cp = ord(ch)
            if 0xFF01 <= cp <= 0xFF5E:
                cleaned.append(chr(cp - 0xFEE0))
            elif cp == 0x3002:
                cleaned.append("\n")
            elif cp == 0x3001:
                cleaned.append(",")
            elif cp in (0x300C, 0x300D):
                cleaned.append('"')
            elif cp in (0x3010, 0x3011):
                cleaned.append("")
            elif cp in (0x201C, 0x201D):
                cleaned.append('"')
            elif cp in (0x2018, 0x2019):
                cleaned.append("'")
            else:
                cleaned.append(ch)
        code = "".join(cleaned)
    # 键名修正：LLM 常输出小写键名
    key_fixes = {
        '"enter"': '"Enter"', '"tab"': '"Tab"', '"escape"': '"Escape"',
        '"ctrl"': '"Control"', '"control"': '"Control"', '"shift"': '"Shift"',
        '"alt"': '"Alt"', '"backspace"': '"Backspace"', '"delete"': '"Delete"',
        '"arrowup"': '"ArrowUp"', '"arrowdown"': '"ArrowDown"',
        '"arrowleft"': '"ArrowLeft"', '"arrowright"': '"ArrowRight"',
    }
    for wrong, right in key_fixes.items():
        code = code.replace(f".press({wrong})", f".press({right})")
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
    result = "\n".join(lines).strip()

    # 语法检查 — 全角字符导致的 SyntaxError 自动修复
    try:
        compile(result, "<step>", "exec")
    except SyntaxError:
        fullwidth_map = {
            0xFF08: "(", 0xFF09: ")", 0xFF0C: ",", 0xFF1B: ";",
            0xFF1A: ":", 0x201C: '"', 0x201D: '"', 0x2018: "'",
            0x2019: "'", 0x3002: None, 0x300C: '"', 0x300D: '"',
            0x3010: "[", 0x3011: "]",
        }
        fixed = result.translate(fullwidth_map)
        try:
            compile(fixed, "<step>", "exec")
            result = fixed
        except SyntaxError:
            pass

    # 清理验证断言中的硬编码数字（如 "服务总数 11" → "服务总数"）
    import re as _re2
    def _strip_trailing_digits(m):
        text = m.group(1)
        cleaned = _re2.sub(r'\s+\d+\s*$', '', text)
        return 'to_contain_text("' + cleaned + '")'
    result = _re2.sub(r'to_contain_text\("([^"]*\s\d+\s*)"\)', _strip_trailing_digits, result)

    return result


def _validate_step_code(code: str, snapshot: str) -> str | None:
    """零 token 静态校验 — 在执行前拦截明显错误的代码，返回错误描述或 None（通过）"""
    if not code or not code.strip() or code.strip() == "pass":
        return "代码为空或只有 pass"
    if code.strip().startswith("raise Exception"):
        return "LLM 生成失败，代码不可执行"
    # LLM 输出了分析文字或只有 wait_for 没有实际操作
    if "page." not in code and "expect(" not in code:
        return "LLM 输出了分析文字而非可执行代码，请只输出 page.xxx 调用"
    action_patterns = [".click(", ".fill(", ".goto(", ".press(", ".check(", ".type(", ".select_option(", ".evaluate(", ".inner_text(", ".text_content("]
    has_action = any(p in code for p in action_patterns)
    has_expect = "expect(" in code
    if not has_action and not has_expect:
        return "代码没有任何操作或断言，请输出 page.xxx 操作或 expect 断言"
    if not has_action and has_expect:
        # 只有 expect 没有操作——可能是验证步骤（允许）或假通过（看 snapshot 判断）
        # 如果当前步骤 action 不含验证关键词，拒绝
        pass  # 在调用处根据 action 判断

    # 1. 禁止的选择器/API
    forbidden = [
        (r'get_by_label\(', "禁止使用 get_by_label（自定义组件 label 关联不可靠）"),
        (r'get_by_placeholder\(', "禁止使用 get_by_placeholder（placeholder 不在 aria snapshot 中）"),
        (r'get_by_role\(\s*["\']option["\']', "禁止使用 get_by_role('option')（自定义下拉没有 option 角色）"),
        (r'\.locator\(\s*["\'][\.\#\[]', "禁止使用 CSS 选择器（.class / #id / [attr]）"),
        (r'query_selector', "禁止使用 query_selector"),
    ]
    for pattern, msg in forbidden:
        if re.search(pattern, code):
            return msg

    # 2. 禁止的语句（_clean_step_code 应该已清理，这是兜底）
    for line in code.splitlines():
        stripped = line.strip()
        if any(stripped.startswith(p) for p in ("import ", "from ", "def ", "async def ", "class ")):
            return f"包含禁止语句: {stripped[:60]}"

    # 3. 元素名称存在性检查（已禁用 — 下拉菜单等动态元素不在 Snapshot 中但可以操作）
    # 让 Playwright 执行时自行报错，由修复循环处理

    return None


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


def _analyze_preconditions(llm_complete, preconditions: str, base_url: str, page, setup_refs: list[dict] | None = None) -> list[dict]:
    """分析前置条件，按 Aemeath 前置二分类：环境前置（跳过）vs 业务数据前置（通过 API 准备）"""
    # 环境前置 — conftest/login 已处理，跳过
    env_keywords = ["已登录", "登录", "账号", "权限", "管理员", "租户", "授权"]
    # 业务数据前置 — 需要检查是否存在，不存在则准备
    data_keywords = ["已存在", "已创建", "存在至少", "已配置", "有在线", "包含健康", "已授权至少"]

    # 处理 \n 字面量（来自 JSON 序列化的换行）
    preconditions = preconditions.replace("\\n", "\n")
    lines = [l.strip() for l in preconditions.split("\n") if l.strip()]
    data_conditions = []
    for line in lines:
        clean = re.sub(r'^\d+[\.\、\s]+', '', line)
        # 环境前置 → 跳过
        if any(kw in clean for kw in env_keywords) and not any(kw in clean for kw in data_keywords):
            continue
        # 业务数据前置 → 需要检查
        if any(kw in clean for kw in data_keywords):
            data_conditions.append(clean)

    if not data_conditions:
        return [], []

    # 通过 page.evaluate(fetch) 检查数据是否存在（不走 UI，走 API 更稳定）
    setup_steps = []
    new_setup_refs = []  # 新生成的 setup 代码，执行通过后持久化
    for condition in data_conditions:
        # 先查 SetupRef 缓存——已验证的 setup 代码直接复用
        matched_ref = None
        if setup_refs:
            for ref in setup_refs:
                if ref.get("condition_pattern", "") in condition or condition in ref.get("condition_pattern", ""):
                    if ref.get("verified"):
                        matched_ref = ref
                        break
        if matched_ref:
            logger.info("复用已验证的 SetupRef: %s", matched_ref["condition_pattern"][:50])
            setup_steps.append({"action": f"[数据检查] {condition[:40]}", "code": matched_ref["code"]})
            continue

        check_code = _generate_data_check(llm_complete, condition, base_url)
        if check_code:
            setup_steps.append(check_code)
            new_setup_refs.append({"condition_pattern": condition, "base_url": base_url, "code": check_code["code"]})

    return setup_steps[:3], new_setup_refs


def _generate_data_check(llm_complete, condition: str, base_url: str) -> dict | None:
    """为一个业务数据前置条件生成 API 检查+准备代码"""
    if llm_complete is None:
        return None
    try:
        prompt = f"""你需要通过 Playwright 的 page.evaluate() 检查前置条件是否满足。

前置条件: {condition}
目标系统 BASE_URL: {base_url}

## 重要：代码格式
代码运行在 Python 的 exec() 中，page 是 Playwright 同步 API 的 Page 对象。
page.evaluate() 接收一个 JavaScript 字符串，在浏览器中执行。

正确示例：
```
result = page.evaluate(\"\"\"async () => {{
    const resp = await fetch('/api/v1/services?page_size=10');
    const data = await resp.json();
    return data.total || (data.data || []).length;
}}\"\"\")
```

## 禁止
- ❌ Python 的 await（代码在同步环境执行）
- ❌ async () => 写在 page.evaluate() 外面
- ❌ import 语句

## 常见 API
- 服务列表: GET /api/v1/services?page_size=10
- 负载配置: GET /api/v1/upstreams?page_size=10
- 集群: GET /api/v1/clusters?page_size=10

只输出 1-5 行 Python 代码（page.evaluate + 简单判断）。
如果该前置条件不需要通过 API 检查（比如"有在线网关节点"这种基础设施），输出 SKIP"""

        resp = llm_complete(prompt, max_tokens=500).strip()
        if "SKIP" in resp.upper():
            return None
        code = _clean_step_code(resp)
        if code and "page.evaluate" in code:
            return {"action": f"[数据检查] {condition[:40]}", "code": code}
        return None
    except Exception:
        return None


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
