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
    """平台直接生成文档：执行 tb-doc-generate Skill。"""

    session_id = uuid.uuid4().hex[:12]
    shot_dir = SCREENSHOT_DIR / str(project_id) / session_id
    shot_dir.mkdir(parents=True, exist_ok=True)

    # Skill 开始
    yield DocGenEvent(type="skill_start", data={"skill": "tb-doc-generate", "totalSteps": 5})

    # Step 1: 启动浏览器并登录
    yield DocGenEvent(type="step_start", data={"step": 1, "title": "启动浏览器并登录"})

    screenshots = []

    try:
        loop = asyncio.get_event_loop()
        screenshots = await loop.run_in_executor(None, _take_screenshots,
            system_url, username, password, modules, str(shot_dir))

        yield DocGenEvent(type="step_done", data={"step": 1, "summary": f"登录成功，进入系统"})

        # Step 2-3: 逐菜单截图（已在 _take_screenshots 中完成）
        yield DocGenEvent(type="step_start", data={"step": 2, "title": "逐页截图"})

        for shot in screenshots:
            yield DocGenEvent(type="screenshot", data={
                "page": shot["page"],
                "file": shot["file"],
                "url": f"/api/screenshots/files/{project_id}/{session_id}/{shot['file']}",
            })

        yield DocGenEvent(type="step_done", data={"step": 2, "summary": f"截图 {len(screenshots)} 张"})

    except Exception as e:
        logger.error("Playwright screenshot failed: %s", e)
        yield DocGenEvent(type="error", data={"message": f"浏览器截图失败: {str(e)[:200]}"})
        return

    # Step 4: AI 写文档
    yield DocGenEvent(type="step_start", data={"step": 3, "title": "AI 写文档"})

    for s in screenshots:
        s['url'] = f"/api/screenshots/files/{project_id}/{session_id}/{s['file']}"

    screenshots_desc = "\n".join(
        f"### 截图 {i+1}: {s['page']}\n![{s['page']}]({s['url']})\n页面地址: {s.get('pageUrl', '')}"
        for i, s in enumerate(screenshots)
    )

    doc_label = {"manual": "操作手册", "acceptance": "验收文档", "demo": "演示文档"}.get(doc_type, "演示文档")
    messages = [
        {"role": "system", "content": f"""你是技术文档专家。根据系统截图信息生成{doc_label}。

## 严格按照以下格式输出：

```
# 标题 — 简短描述

演示什么功能，完成什么工作流。

涉及模块：模块A、模块B

__演示耗时__：约 N 分钟

## 场景概述

这个功能做什么，为什么有用。

## 前置条件

使用什么角色登录，需要什么前提

> **操作提示：** 文档中的名称等均为示例值...

## 操作步骤

### 步骤一：动作名称

1. 具体操作（点击哪里、输入什么）
2. 下一步操作
3. 点击【按钮名称】
    - 预期：提示「xxx成功」，列表中出现xxx

![](截图路径)

截图说明文字

### 步骤二：...

__演示话术__：一句话总结核心价值。
```

要求：
- 图片引用用 ![](url) 格式，url 用提供的截图路径
- 每个步骤必须有截图
- 操作步骤要具体到按钮名称、输入内容
- 预期结果要明确
"""},
        {"role": "user", "content": f"""请生成【{doc_label}】：

标题：{title}
系统地址：{system_url}
文档范围：{modules or '全部功能'}
目标读者：{audience or '测试工程师'}
{f'业务背景：{business_context}' if business_context else ''}

以下是系统各页面的截图，请根据每张截图写操作步骤：

{screenshots_desc}

请严格按照上面定义的格式输出完整文档。"""},
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

    yield DocGenEvent(type="step_done", data={"step": 3, "summary": f"文档 {len(full_content)} 字符"})

    # Step 5: 保存文档
    yield DocGenEvent(type="step_start", data={"step": 4, "title": "保存文档"})

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

        # 2.5 尝试进入第一个项目（从项目列表页进入项目内页面）
        try:
            project_card = page.locator('.ant-card').first
            if project_card.count() > 0:
                project_card.click()
                page.wait_for_timeout(2000)
                fname = "03_project_home.png"
                page.screenshot(path=str(shot_path / fname))
                screenshots.append({"page": "项目首页", "file": fname, "pageUrl": page.url})
        except Exception:
            pass

        # 3. 逐个点击菜单项截图
        menu_items = page.locator('.ant-menu-item, nav a, [role="menuitem"]').all()
        visited_texts = set()
        idx = 4

        for item in menu_items:
            try:
                text = item.text_content().strip()
                if not text or text in visited_texts or len(text) > 30:
                    continue
                if text in ('返回项目列表',):
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
