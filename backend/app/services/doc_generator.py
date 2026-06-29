"""文档自动生成服务 — Playwright 截图 + AI 写文档"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator

from app.services.ai import llm_client
from app.services.ai_config_resolver import ResolvedAIConfig

logger = logging.getLogger(__name__)

SCREENSHOT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class DocGenEvent:
    type: str  # progress | screenshot | error | done
    data: dict


async def generate_doc_with_screenshots(
    *,
    system_url: str,
    username: str,
    password: str,
    title: str,
    doc_type: str,
    modules: str | None,
    audience: str | None,
    business_context: str | None,
    ai_config: ResolvedAIConfig,
    project_id: uuid.UUID,
) -> AsyncIterator[DocGenEvent]:
    """平台直接生成文档：Playwright 截图 + AI 写文档。"""

    session_id = uuid.uuid4().hex[:12]
    shot_dir = SCREENSHOT_DIR / str(project_id) / session_id
    shot_dir.mkdir(parents=True, exist_ok=True)

    yield DocGenEvent(type="progress", data={"step": "init", "message": "正在启动浏览器..."})

    screenshots = []

    try:
        # Playwright 是同步 API，在线程池中运行
        loop = asyncio.get_event_loop()
        screenshots = await loop.run_in_executor(None, _take_screenshots,
            system_url, username, password, modules, str(shot_dir))

        for shot in screenshots:
            yield DocGenEvent(type="screenshot", data={
                "page": shot["page"],
                "file": shot["file"],
                "url": f"/api/screenshots/files/{project_id}/{session_id}/{shot['file']}",
            })

        yield DocGenEvent(type="progress", data={"step": "ai", "message": f"已截图 {len(screenshots)} 张，AI 正在写文档..."})

    except Exception as e:
        logger.error("Playwright screenshot failed: %s", e)
        yield DocGenEvent(type="error", data={"message": f"浏览器截图失败: {str(e)[:200]}"})
        return

    # AI 根据截图信息生成文档
    screenshots_desc = "\n".join(
        f"### 截图 {i+1}: {s['page']}\n![{s['page']}]({s['url']})\n页面地址: {s.get('pageUrl', '')}"
        for i, s in enumerate(screenshots)
        if 'url' not in s or True  # 给每个截图加 url
    )
    # 补上 url
    for s in screenshots:
        s['url'] = f"/api/screenshots/files/{project_id}/{session_id}/{s['file']}"

    screenshots_desc = "\n".join(
        f"### 截图 {i+1}: {s['page']}\n![{s['page']}]({s['url']})\n页面地址: {s.get('pageUrl', '')}"
        for i, s in enumerate(screenshots)
    )

    doc_label = {"manual": "操作手册", "acceptance": "验收文档", "training": "培训教材"}.get(doc_type, "操作手册")
    messages = [
        {"role": "system", "content": f"你是技术文档专家。根据系统截图信息生成{doc_label}。每个截图对应一个操作步骤章节，用 Markdown 格式，图片用 ![](url) 引用。"},
        {"role": "user", "content": f"""请生成【{doc_label}】：

标题：{title}
系统地址：{system_url}
文档范围：{modules or '全部功能'}
目标读者：{audience or '测试工程师'}
{f'业务背景：{business_context}' if business_context else ''}

以下是系统各页面的截图，请根据每张截图写操作说明：

{screenshots_desc}

要求：
- 每个截图一个章节
- 说明这个页面是干什么的、怎么操作
- 用 ![截图名](url) 引用截图
- 输出完整 Markdown"""},
    ]

    full_content = ""
    try:
        async for chunk in llm_client.stream(messages, config=ai_config):
            if chunk.delta:
                full_content += chunk.delta
                yield DocGenEvent(type="chunk", data={"content": chunk.delta})
    except Exception as e:
        yield DocGenEvent(type="error", data={"message": f"AI 生成失败: {str(e)[:200]}"})
        return

    yield DocGenEvent(type="done", data={
        "content": full_content,
        "screenshots": [{"page": s["page"], "url": s["url"], "file": s["file"]} for s in screenshots],
        "screenshotCount": len(screenshots),
    })


def _take_screenshots(system_url: str, username: str, password: str, modules: str | None, shot_dir: str) -> list[dict]:
    """同步函数：Playwright 打开浏览器截图。"""
    from playwright.sync_api import sync_playwright

    screenshots = []
    shot_path = Path(shot_dir)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # 1. 打开登录页
        page.goto(system_url, timeout=15000)
        page.wait_for_timeout(2000)
        fname = "01_login.png"
        page.screenshot(path=str(shot_path / fname))
        screenshots.append({"page": "登录页面", "file": fname, "pageUrl": system_url})

        # 2. 尝试登录
        try:
            # 通用登录：找 username/password 输入框
            username_input = page.locator('input[type="text"], input[id*="user"], input[name*="user"], input[placeholder*="用户"]').first
            password_input = page.locator('input[type="password"]').first

            if username_input.count() > 0 and password_input.count() > 0:
                username_input.fill(username)
                password_input.fill(password)
                # 点登录按钮
                login_btn = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Login")').first
                if login_btn.count() > 0:
                    login_btn.click()
                    page.wait_for_timeout(3000)

                fname = "02_after_login.png"
                page.screenshot(path=str(shot_path / fname))
                screenshots.append({"page": "登录后首页", "file": fname, "pageUrl": page.url})
        except Exception as e:
            logger.warning("Login attempt failed: %s", e)

        # 3. 找导航菜单项，逐个点击截图
        menu_items = page.locator('.ant-menu-item, nav a, [role="menuitem"]').all()
        visited_texts = set()
        idx = 3

        for item in menu_items:
            try:
                text = item.text_content().strip()
                if not text or text in visited_texts or len(text) > 20:
                    continue
                # 如果指定了模块范围，只截相关的
                if modules and not any(m.strip() in text for m in modules.split('、')):
                    continue

                visited_texts.add(text)
                item.click()
                page.wait_for_timeout(2000)

                fname = f"{idx:02d}_{text.replace('/', '_')[:20]}.png"
                page.screenshot(path=str(shot_path / fname))
                screenshots.append({"page": text, "file": fname, "pageUrl": page.url})
                idx += 1

                if idx > 15:  # 最多 15 张截图
                    break
            except Exception:
                continue

        browser.close()

    return screenshots
