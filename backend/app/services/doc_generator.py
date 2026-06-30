"""文档自动生成服务 — 通用 Playwright 截图 + AI 写文档"""
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
    type: str
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
    """执行 tb-doc-generate Skill：通用 Web 截图 + AI 写文档。"""

    session_id = uuid.uuid4().hex[:12]
    shot_dir = SCREENSHOT_DIR / str(project_id) / session_id
    shot_dir.mkdir(parents=True, exist_ok=True)

    yield DocGenEvent(type="skill_start", data={"skill": "tb-doc-generate", "totalSteps": 5})

    # Step 1: 启动浏览器并登录
    yield DocGenEvent(type="step_start", data={"step": 1, "title": "启动浏览器并登录"})

    screenshots = []
    try:
        loop = asyncio.get_event_loop()
        screenshots = await loop.run_in_executor(
            None, _take_screenshots,
            system_url, username, password, modules, str(shot_dir),
        )
        yield DocGenEvent(type="step_done", data={"step": 1, "summary": f"登录成功"})
    except Exception as e:
        logger.error("Playwright failed: %s", e)
        yield DocGenEvent(type="error", data={"message": f"浏览器操作失败: {str(e)[:200]}"})
        return

    # Step 2: 截图结果
    yield DocGenEvent(type="step_start", data={"step": 2, "title": "逐页截图"})
    for s in screenshots:
        s['url'] = f"/api/screenshots/files/{project_id}/{session_id}/{s['file']}"
        yield DocGenEvent(type="screenshot", data={
            "page": s["page"], "file": s["file"], "url": s["url"],
            "isTarget": s.get("isTarget", False),
        })
    yield DocGenEvent(type="step_done", data={
        "step": 2,
        "summary": f"截图 {len(screenshots)} 张（目标模块 {sum(1 for s in screenshots if s.get('isTarget'))} 张）",
    })

    # Step 3: AI 写文档
    yield DocGenEvent(type="step_start", data={"step": 3, "title": "AI 写文档"})

    screenshots_desc = "\n".join(
        f"### 截图 {i+1}: {s['page']}{' ⭐目标模块' if s.get('isTarget') else ''}\n![{s['page']}]({s['url']})\n页面地址: {s.get('pageUrl', '')}"
        for i, s in enumerate(screenshots)
    )

    doc_label = {"manual": "操作手册", "acceptance": "验收文档", "demo": "演示文档"}.get(doc_type, "演示文档")

    # 从 SKILL.md 读取格式模板
    format_template = _load_format_template(doc_type)

    messages = [
        {"role": "system", "content": f"""你是技术文档专家。根据系统截图信息生成{doc_label}。

## 严格按照以下格式输出：

```
{format_template}
```

## 重要约束：
- 文档范围是「{modules or '全部功能'}」，只详细写这个范围内的功能
- 标记为⭐目标模块的截图要详细展开操作步骤
- 其他截图仅作为导航说明，不展开
- 操作步骤要具体到按钮名称、输入内容、预期结果
- 图片引用用 ![](url) 格式
"""},
        {"role": "user", "content": f"""请生成【{doc_label}】：

标题：{title}
系统地址：{system_url}
文档范围：{modules or '全部功能'}
目标读者：{audience or '测试工程师'}
{f'业务背景：{business_context}' if business_context else ''}

以下是系统截图（⭐标记的是目标模块，要详细写）：

{screenshots_desc}

请严格按照格式模板输出。"""},
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
    yield DocGenEvent(type="step_start", data={"step": 4, "title": "保存文档"})
    yield DocGenEvent(type="done", data={
        "content": full_content,
        "screenshots": [{"page": s["page"], "url": s["url"], "file": s["file"]} for s in screenshots],
        "screenshotCount": len(screenshots),
    })


def _load_format_template(doc_type: str) -> str:
    """从 SKILL.md 中提取对应文档类型的格式模板。"""
    skill_path = Path(__file__).resolve().parent.parent / "skills" / "preset" / "tb-doc-generate" / "SKILL.md"
    if not skill_path.exists():
        return "按标准 Markdown 格式输出"

    content = skill_path.read_text(encoding="utf-8")
    import re

    type_labels = {"demo": "演示文档（demo）", "manual": "操作手册（manual）", "acceptance": "验收文档（acceptance）"}
    label = type_labels.get(doc_type, "演示文档（demo）")

    pattern = rf"#### {re.escape(label)}\s*\n```markdown\n(.*?)```"
    match = re.search(pattern, content, re.DOTALL)
    if match:
        return match.group(1).strip()
    return "按标准 Markdown 格式输出"


def _take_screenshots(system_url: str, username: str, password: str, modules: str | None, shot_dir: str) -> list[dict]:
    """通用 Web 截图：不依赖特定 UI 框架。"""
    from playwright.sync_api import sync_playwright

    screenshots = []
    shot_path = Path(shot_dir)
    module_keywords = [m.strip() for m in modules.split('、')] if modules else []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Step 1: 打开系统
        page.goto(system_url, timeout=15000)
        page.wait_for_timeout(2000)
        _save_shot(page, shot_path, screenshots, "登录页面", system_url)

        # Step 2: 尝试登录（通用：找输入框和提交按钮）
        _try_login(page, username, password)
        page.wait_for_timeout(3000)
        _save_shot(page, shot_path, screenshots, "登录后首页", page.url)

        # Step 3: 找导航菜单并逐个截图
        nav_items = _find_nav_items(page)
        logger.info("Found %d nav items", len(nav_items))

        for text, element in nav_items:
            if not text or len(text) > 30:
                continue

            is_target = not module_keywords or any(kw in text for kw in module_keywords)

            try:
                element.click(timeout=3000)
                page.wait_for_timeout(2000)
            except Exception:
                continue

            _save_shot(page, shot_path, screenshots, text, page.url, is_target=is_target)

            # 目标模块：深度截图
            if is_target:
                _deep_screenshots(page, shot_path, screenshots, text)

            if len(screenshots) >= 20:
                break

        browser.close()

    return screenshots


def _try_login(page, username: str, password: str):
    """通用登录：找用户名/密码输入框 + 提交按钮。"""
    try:
        # 找用户名输入框：按 type、id、name、placeholder 匹配
        user_selectors = [
            'input[id*="user" i]', 'input[name*="user" i]',
            'input[placeholder*="用户" i]', 'input[placeholder*="user" i]',
            'input[placeholder*="account" i]', 'input[placeholder*="email" i]',
            'input[type="text"]:not([type="password"])',
        ]
        for sel in user_selectors:
            el = page.locator(sel).first
            if el.count() > 0:
                el.fill(username)
                break

        # 找密码输入框
        pwd = page.locator('input[type="password"]').first
        if pwd.count() > 0:
            pwd.fill(password)

        # 找提交按钮
        btn_selectors = [
            'button[type="submit"]',
            'button:has-text("登录")', 'button:has-text("Login")',
            'button:has-text("Sign in")', 'button:has-text("Log in")',
            'input[type="submit"]',
        ]
        for sel in btn_selectors:
            btn = page.locator(sel).first
            if btn.count() > 0:
                btn.click()
                return
    except Exception as e:
        logger.warning("Login failed: %s", e)


def _find_nav_items(page) -> list[tuple[str, any]]:
    """通用导航发现：按优先级查找侧边栏/顶部导航。"""
    selectors = [
        # 语义化导航
        'nav a', 'aside a',
        # 常见 UI 框架
        '[role="menuitem"]',
        'li[class*="menu"] > a', 'li[class*="menu"] > span',
        'li[class*="nav"] > a',
        # Ant Design
        '.ant-menu-item',
        # Element UI
        '.el-menu-item',
        # 通用
        '[class*="sidebar"] a', '[class*="side-nav"] a',
    ]

    visited = set()
    items = []

    for sel in selectors:
        try:
            elements = page.locator(sel).all()
            for el in elements:
                try:
                    text = el.text_content().strip()
                    if text and text not in visited and 2 <= len(text) <= 30:
                        visited.add(text)
                        items.append((text, el))
                except Exception:
                    continue
            if len(items) >= 5:
                break
        except Exception:
            continue

    return items


def _deep_screenshots(page, shot_path, screenshots, parent_name):
    """通用深度截图：只在主内容区域找操作按钮。"""
    action_keywords = [
        '新增', '创建', '添加', '新建',
        'Add', 'Create', 'New',
    ]

    # 限定在主内容区域找按钮，排除侧边栏/导航
    content_selectors = [
        'main button', '[class*="content"] button',
        '[class*="main"] button', '[class*="body"] button',
        '#root > div > div:last-child button',  # 通常最后一个 div 是内容区
    ]

    buttons = []
    for sel in content_selectors:
        found = page.locator(sel).all()
        if found:
            buttons = found
            break
    if not buttons:
        buttons = page.locator('button').all()

    deep_count = 0
    clicked_texts = set()
    for btn in buttons:
        if deep_count >= 3:
            break
        try:
            text = btn.text_content().strip()
            if not text or not any(kw in text for kw in action_keywords):
                continue
            if not btn.is_visible():
                continue
            # 排除明显不属于当前模块的按钮（按钮文字包含其他模块名）
            skip_keywords = ['AI', 'Mock', 'MCP', 'LLM', 'API', 'Skill']
            if any(sk in text for sk in skip_keywords) and not any(sk in parent_name for sk in skip_keywords):
                continue
            if text in clicked_texts:
                continue
            clicked_texts.add(text)

            btn.click(timeout=2000)
            page.wait_for_timeout(1500)

            # 检查是否出现了弹窗/对话框/抽屉
            dialog_selectors = [
                '[role="dialog"]', '[class*="modal"]', '[class*="drawer"]',
                '[class*="dialog"]', '[class*="popup"]',
            ]
            has_dialog = False
            for sel in dialog_selectors:
                if page.locator(sel).count() > 0:
                    has_dialog = True
                    break

            if has_dialog:
                _save_shot(page, shot_path, screenshots, f"{parent_name} - {text}", page.url, is_target=True)
                deep_count += 1

                # 关闭弹窗
                close_selectors = [
                    '[class*="close"]', 'button:has-text("取消")', 'button:has-text("Cancel")',
                    'button:has-text("关闭")', 'button:has-text("Close")',
                ]
                for sel in close_selectors:
                    close_btn = page.locator(sel).first
                    if close_btn.count() > 0:
                        try:
                            close_btn.click(timeout=1000)
                            page.wait_for_timeout(500)
                            break
                        except Exception:
                            continue

                # 按 Escape 兜底关闭
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)

        except Exception:
            continue


def _save_shot(page, shot_path, screenshots, name, url, is_target=False):
    """保存截图，跳过空名称。"""
    if not name or name == 'None':
        return
    idx = len(screenshots) + 1
    safe_name = name.replace('/', '_').replace(' ', '_')[:20]
    fname = f"{idx:02d}_{safe_name}.png"
    page.screenshot(path=str(shot_path / fname))
    screenshots.append({"page": name, "file": fname, "pageUrl": url, "isTarget": is_target})
