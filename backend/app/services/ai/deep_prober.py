"""深度页面探测 — 沿用例步骤导航目标系统，采集每页真实元素结构"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


def deep_probe(
    base_url: str,
    credentials: dict[str, str],
    steps: list[dict],
) -> list[dict]:
    """
    沿着用例步骤导航目标系统，在每个关键页面采集元素结构。

    Returns: [
        {"step": "进入服务管理页面", "url": "...", "elements": {...}},
        {"step": "点击创建服务", "url": "...", "elements": {...}},
    ]
    """
    from playwright.sync_api import sync_playwright

    results = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(locale="zh-CN", viewport={"width": 1280, "height": 720})
            page = context.new_page()
            page.set_default_timeout(10000)

            # 登录
            page.goto(base_url)
            page.wait_for_load_state("networkidle")
            if "/login" in page.url:
                _login(page, credentials.get("username", ""), credentials.get("password", ""))

            # 采集登录后首页
            results.append({
                "step": "登录后首页",
                "url": page.url,
                "elements": _capture_page(page),
            })

            # 沿着步骤尝试导航
            for step in steps:
                action = step.get("action", "")
                if not action:
                    continue

                clicked = _try_navigate(page, action)
                if clicked:
                    try:
                        page.wait_for_load_state("networkidle")
                        page.wait_for_timeout(1000)
                    except Exception:
                        pass
                    results.append({
                        "step": action[:80],
                        "url": page.url,
                        "elements": _capture_page(page),
                    })

            browser.close()
    except Exception as e:
        logger.warning("深度探测失败: %s", e)
        results.append({"error": str(e)[:300]})

    return results


def _login(page, username: str, password: str):
    """通用登录"""
    inputs = page.locator("input:not([type=hidden])").all()
    for inp in inputs:
        inp_type = inp.get_attribute("type") or "text"
        if inp_type == "password":
            inp.fill(password)
        elif inp_type in ("text", "email", ""):
            inp.fill(username)
    submit = page.locator("button[type=submit]")
    if submit.count() == 0:
        submit = page.get_by_role("button", name="登录", exact=True)
    try:
        submit.first.click()
        page.wait_for_url(lambda url: "/login" not in url, timeout=10000)
        page.wait_for_load_state("networkidle")
    except Exception as e:
        logger.warning("登录失败: %s", e)


def _try_navigate(page, action: str) -> bool:
    """根据步骤描述尝试在页面上执行点击导航。支持多步操作（下拉菜单等）"""
    targets = re.findall(r'[「「](.+?)[」」]', action)
    if not targets:
        m = re.search(r'点击\s*(.+?)\s*(?:按钮|菜单|链接|标签|Tab)', action)
        if m:
            targets = [m.group(1)]

    clicked_any = False
    for target in targets:
        try:
            for loc_fn in [
                lambda t=target: page.get_by_role("link", name=t),
                lambda t=target: page.get_by_role("button", name=t),
                lambda t=target: page.get_by_role("menuitem", name=t),
                lambda t=target: page.get_by_text(t, exact=True),
                lambda t=target: page.get_by_text(t),
            ]:
                loc = loc_fn()
                if loc.count() > 0:
                    loc.first.click()
                    clicked_any = True
                    try:
                        page.wait_for_timeout(500)
                    except Exception:
                        pass
                    break
        except Exception:
            continue

    return clicked_any


def _capture_page(page) -> dict:
    """采集当前页面的真实元素结构——使用 Aria Snapshot"""
    result = {}
    try:
        snapshot = page.locator('body').aria_snapshot()
        result["aria_snapshot"] = snapshot[:4000]
    except Exception:
        pass

    # fallback: 手动采集关键元素
    try:
        buttons = page.get_by_role("button").all_inner_texts()
        if buttons:
            result["buttons"] = [t.strip() for t in buttons if t.strip()][:20]
        inputs_info = page.locator("input:not([type=hidden]), textarea").evaluate_all("""
            els => els.map(e => {
                const label = e.closest('label')?.textContent?.trim()
                    || document.querySelector('label[for=\"' + e.id + '\"]')?.textContent?.trim()
                    || e.getAttribute('aria-label') || '';
                return { type: e.type || 'text', placeholder: e.placeholder || '', label: label.substring(0, 50) };
            }).filter(e => e.label || e.placeholder)
        """)
        if inputs_info:
            result["inputs"] = inputs_info[:20]
    except Exception:
        pass

    return result


def format_probe_for_prompt(probe_results: list[dict]) -> str:
    """将探测结果格式化为 AI 可读的文本"""
    if not probe_results:
        return ""

    lines = ["以下是 Playwright 实际访问目标系统后采集到的每个页面的 Aria Snapshot（无障碍树）：\n"]

    for i, page_data in enumerate(probe_results):
        if "error" in page_data:
            lines.append(f"探测出错: {page_data['error']}")
            continue

        lines.append(f"### 页面 {i+1}: {page_data.get('step', '?')}")
        lines.append(f"URL: {page_data.get('url', '?')}")

        elements = page_data.get("elements", {})
        if elements.get("aria_snapshot"):
            lines.append(f"```yaml\n{elements['aria_snapshot']}\n```")
        if elements.get("inputs"):
            lines.append("输入框详情:")
            for inp in elements["inputs"]:
                label = inp.get("label", "")
                ph = inp.get("placeholder", "")
                lines.append(f"  - [{inp.get('type','')}] label=\"{label}\" placeholder=\"{ph}\"")
        lines.append("")

    lines.append("**重要：脚本中必须使用以上 Aria Snapshot 中出现的真实角色和名称来定位元素。使用 get_by_role / get_by_text / get_by_label，不能编造。**")
    return "\n".join(lines)
