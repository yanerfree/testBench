"""页面探测 — 用 Playwright 访问目标页面，获取 Aria snapshot 和页面信息"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def probe_page(base_url: str, credentials: dict[str, str] | None = None) -> dict:
    """
    用 Playwright 访问目标系统，返回页面结构信息。

    Returns: {
        "logged_in": bool,
        "login_page_snapshot": str | None,  # 登录页 aria snapshot
        "main_page_snapshot": str | None,   # 登录后主页 aria snapshot
        "current_url": str,
    }
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"error": "playwright not installed"}

    result = {
        "logged_in": False,
        "login_page_snapshot": None,
        "main_page_snapshot": None,
        "current_url": "",
    }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(locale="zh-CN", viewport={"width": 1280, "height": 720})
            page = context.new_page()
            page.set_default_timeout(15000)

            page.goto(base_url)
            page.wait_for_load_state("networkidle")
            result["current_url"] = page.url

            result["login_page_snapshot"] = _get_page_structure(page)

            if "/login" in page.url or _has_login_form(page):
                if credentials:
                    _try_login(page, credentials)
                    page.wait_for_load_state("networkidle")
                    result["current_url"] = page.url
                    if "/login" not in page.url:
                        result["logged_in"] = True
                        result["main_page_snapshot"] = _get_page_structure(page)

            browser.close()
    except Exception as e:
        logger.warning("页面探测失败: %s", e)
        result["error"] = str(e)[:500]

    return result


def _has_login_form(page) -> bool:
    """检测页面是否有登录表单"""
    try:
        return (
            page.locator("button[type='submit']").or_(
                page.get_by_role("button", name="登录", exact=True)
            ).or_(
                page.get_by_role("button", name="Login", exact=True)
            ).or_(
                page.get_by_role("button", name="Sign in", exact=True)
            ).count() > 0
        )
    except Exception:
        return False


def _try_login(page, credentials: dict[str, str]):
    """尝试登录"""
    username = credentials.get("username", "")
    password = credentials.get("password", "")
    if not username or not password:
        return

    try:
        all_inputs = page.locator("input:not([type='hidden'])").all()
        filled = 0
        for inp in all_inputs:
            inp_type = inp.get_attribute("type") or "text"
            if inp_type == "password":
                inp.fill(password)
                filled += 1
            elif inp_type in ("text", "email", "") and filled == 0:
                inp.fill(username)
                filled += 1

        submit = page.locator("button[type='submit']").or_(
            page.get_by_role("button", name="登录", exact=True)
        ).or_(
            page.get_by_role("button", name="Login", exact=True)
        ).or_(
            page.get_by_role("button", name="Sign in", exact=True)
        )
        if submit.count() > 0:
            submit.first.click()
            page.wait_for_timeout(3000)
    except Exception as e:
        logger.warning("自动登录失败: %s", e)


def _format_snapshot(snapshot: dict | None, depth: int = 0, max_depth: int = 4) -> str:
    """将 accessibility snapshot 格式化为可读文本"""
    if not snapshot:
        return ""
    lines = []
    indent = "  " * depth
    role = snapshot.get("role", "")
    name = snapshot.get("name", "")

    if role and role not in ("none", "generic"):
        label = f"{indent}- {role}"
        if name:
            label += f' "{name}"'
        lines.append(label)

    if depth < max_depth:
        for child in snapshot.get("children", []):
            lines.append(_format_snapshot(child, depth + 1, max_depth))

    return "\n".join(line for line in lines if line)


def _get_page_structure(page) -> str:
    """获取页面结构 — 提取所有可交互元素的文字"""
    try:
        parts = []
        # 导航/菜单
        nav_items = page.locator("nav a, nav span, [class*='menu'] a, [class*='menu'] span, [class*='sidebar'] a").all_inner_texts()
        if nav_items:
            parts.append("导航菜单: " + " | ".join(t.strip() for t in nav_items if t.strip())[:800])
        # 按钮
        buttons = page.get_by_role("button").all_inner_texts()
        if buttons:
            parts.append("按钮: " + " | ".join(t.strip() for t in buttons if t.strip())[:500])
        # 标题
        headings = page.locator("h1, h2, h3").all_inner_texts()
        if headings:
            parts.append("标题: " + " | ".join(t.strip() for t in headings if t.strip())[:300])
        # 输入框
        inputs = page.locator("input[placeholder], input[aria-label]").evaluate_all(
            "els => els.map(e => e.placeholder || e.getAttribute('aria-label') || e.name).filter(Boolean)"
        )
        if inputs:
            parts.append("输入框: " + " | ".join(inputs)[:300])
        # 链接
        links = page.get_by_role("link").all_inner_texts()
        if links:
            parts.append("链接: " + " | ".join(t.strip() for t in links if t.strip())[:500])
        return "\n".join(parts) if parts else page.inner_text("body")[:1000]
    except Exception as e:
        logger.warning("获取页面结构失败: %s", e)
        try:
            return page.inner_text("body")[:1000]
        except Exception:
            return ""
