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

    FORMAT_TEMPLATES = {
        "demo": """# 标题 — 简短描述

演示什么功能，完成什么工作流。

涉及模块：模块A、模块B

__演示耗时__：约 N 分钟

## 场景概述
功能做什么，为什么有用。

## 前置条件
使用什么角色登录，需要什么前提
> **操作提示：** 名称等均为示例值...

## 操作步骤

### 步骤一：动作名称
1. 具体操作
2. 点击【按钮名称】
    - 预期：提示「xxx成功」

![](截图路径)

截图说明文字

__演示话术__：一句话总结。""",

        "manual": """# 产品名称操作手册-模块篇

**公司名称**
**日期**

---

# 1. 简介

## 1.1 模块概述
模块做什么，核心能力。

## 1.2 功能介绍
- **功能A：** 一句话说明
- **功能B：** 一句话说明

## 1.3 术语定义
| 术语 | 解释 |
|---|---|
| 术语A | 解释 |

---

# 2. 操作指南

## 2.1 登录与权限说明
**登录操作：** 访问平台，输入用户名密码
**权限要求：** 需要什么权限
> **提示：** 权限说明

## 2.2 功能A
### 2.2.1 子功能
**适用场景：** 什么时候用
**前置条件：** 需要什么前提
**操作步骤：**
1. 进入【菜单名】页面
2. 点击"按钮名"
3. 预期：提示"成功"

![](截图路径)
*图：截图说明*""",

        "acceptance": """# 项目名称 验收文档

## 验收标准
| # | 验收项 | 验证方法 | 预期结果 | 通过标准 |
|---|--------|---------|---------|---------|
| 1 | 功能A | 操作步骤 | 成功 | 正常响应 |

## 详细验证步骤
### 验收项 1：功能A
1. 操作步骤
![](截图路径)
结果：✅ 通过""",
    }

    format_template = FORMAT_TEMPLATES.get(doc_type, FORMAT_TEMPLATES["demo"])

    messages = [
        {"role": "system", "content": f"""你是技术文档专家。根据系统截图信息生成{doc_label}。

## 严格按照以下格式输出：

```
{format_template}
```

## 重要约束：
- 文档范围是「{modules or '全部功能'}」，只写这个范围内的功能操作，不要把所有截图都写成独立章节
- 与文档范围无关的截图只作为导航说明的配图，不展开详细操作步骤
- 每个功能要写到具体的操作级别：打开弹窗→填写表单→点击按钮→看到结果
- 图片引用用 ![](url) 格式
- 操作步骤要具体到按钮名称、输入内容、预期结果
"""},
        {"role": "user", "content": f"""请生成【{doc_label}】：

标题：{title}
系统地址：{system_url}
文档范围：{modules or '全部功能'}（只写这个范围的功能，其他截图仅用于导航说明）
目标读者：{audience or '测试工程师'}
{f'业务背景：{business_context}' if business_context else ''}

以下是系统各页面的截图：

{screenshots_desc}

请严格按照格式模板输出，重点写「{modules or '全部功能'}」的详细操作。"""},
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

        # 2.5 判断是在系统级还是项目级截图
        system_level_modules = {'用户管理', '环境配置', '通知渠道', 'AI 服务配置', 'Users', 'Environments'}
        is_system_level = modules and any(m.strip() in system_level_modules for m in modules.split('、'))

        if not is_system_level:
            # 进入第一个项目
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
        module_keywords = [m.strip() for m in modules.split('、')] if modules else []
        menu_items = page.locator('.ant-menu-item, nav a, [role="menuitem"]').all()
        visited_texts = set()
        idx = 4

        for item in menu_items:
            try:
                text = item.text_content().strip()
                if not text or text in visited_texts or len(text) > 30:
                    continue
                if text in ('返回项目列表', 'Back to Projects'):
                    continue

                visited_texts.add(text)
                is_target = not module_keywords or any(kw in text for kw in module_keywords)

                item.click()
                page.wait_for_timeout(2000)

                fname = f"{idx:02d}_{text.replace('/', '_')[:20]}.png"
                page.screenshot(path=str(shot_path / fname))
                screenshots.append({"page": text, "file": fname, "pageUrl": page.url, "isTarget": is_target})
                idx += 1

                # 对目标模块做深度截图：找页面上的操作按钮并点击
                if is_target:
                    _deep_screenshot(page, shot_path, screenshots, idx, text)
                    idx = len(screenshots) + 1

                if idx > 20:
                    break
            except Exception:
                continue

        browser.close()

    return screenshots


def _deep_screenshot(page, shot_path, screenshots, start_idx, parent_name):
    """对目标模块页面做深度截图：找按钮→点击→截弹窗/新页面。"""
    idx = start_idx
    action_buttons = page.locator('button').all()

    for btn in action_buttons:
        try:
            btn_text = btn.text_content().strip()
            if not btn_text or len(btn_text) > 15:
                continue
            # 只点"新增/创建/添加/编辑"类按钮
            if not any(kw in btn_text for kw in ('新增', '创建', '添加', '新建', 'Add', 'Create', 'New')):
                continue

            btn.click()
            page.wait_for_timeout(1500)

            # 检查是否打开了弹窗
            modal = page.locator('.ant-modal-content, .ant-drawer-content')
            if modal.count() > 0:
                fname = f"{idx:02d}_{parent_name}_{btn_text}.png"
                page.screenshot(path=str(shot_path / fname))
                screenshots.append({
                    "page": f"{parent_name} - {btn_text}弹窗",
                    "file": fname,
                    "pageUrl": page.url,
                    "isTarget": True,
                })
                idx += 1

                # 关闭弹窗
                close = page.locator('.ant-modal-close, .ant-drawer-close').first
                if close.count() > 0:
                    close.click()
                    page.wait_for_timeout(500)

            if idx >= start_idx + 3:  # 每个模块最多深度截 3 张
                break
        except Exception:
            continue
