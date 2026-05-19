---
name: generate-ui-tests
description: '探索页面并自动生成 Playwright E2E 测试脚本。Use when user says "生成 UI 测试" or "generate ui tests for [page]"'
allowed-tools: Bash(playwright-cli:*) Read Write Glob
---

# UI 测试脚本自动生成

通过 playwright-cli 驱动浏览器探索目标页面，识别交互元素和业务流程，自动生成可重复执行的 Playwright pytest 脚本。

## 输入参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `目标页面` | ✅ | 完整 URL 或路径（如 `http://localhost:5173/projects`） |
| `模块名` | ✅ | 业务模块（如 `projects`、`cases`、`plans`），用于文件命名和 tea_id |
| `文档路径` | 可选 | 需求/接口/设计文档路径（有文档则按文档验证，无文档则探索推导） |
| `凭据来源` | 可选 | 默认从 `.env` 读取 `USERNAME`/`PASSWORD` |

---

## 执行流程

```
Step 1 加载规范    → 读取 project-context.md + .env 凭据
Step 2 探索页面    → playwright-cli 打开页面，识别元素结构
Step 3 交互分析    → 操作元素，记录行为和网络请求
Step 4 推导场景    → 根据页面元素类型推导测试场景
Step 5 生成脚本    → 输出 Playwright pytest 脚本文件
Step 6 更新索引    → 同步 tea-cases.json
Step 7 报告       → 输出生成摘要
```

---

## Step 1：加载项目规范

用 `Read` 工具读取以下文件：

1. **`project-context.md`** — 目录结构、E2E 脚本模板
2. **`.env`** — 获取登录凭据和应用 URL

```
.env 格式示例：
USERNAME=admin
PASSWORD=admin123
APP_URL=http://localhost:5173
```

如果用户提供了文档路径，读取文档提取：
- 功能点清单
- 字段规则（必填/长度/枚举值）
- UI 交互预期（弹窗、跳转、消息提示等）

---

## Step 2：探索页面

### 2.1 登录

```bash
playwright-cli open {APP_URL}
playwright-cli snapshot
# 识别登录表单
playwright-cli fill <用户名输入框ref> "{USERNAME}"
playwright-cli fill <密码输入框ref> "{PASSWORD}"
playwright-cli click <登录按钮ref>
playwright-cli snapshot
```

### 2.2 导航到目标页面

```bash
playwright-cli goto {目标页面URL}
playwright-cli snapshot
```

### 2.3 元素识别

从 snapshot 中识别页面元素并分类：

| 类别 | 识别特征 | 记录信息 |
|------|---------|---------|
| **表单** | input, textarea, select, radio, checkbox | 字段名、类型、placeholder |
| **按钮** | button, a[role=button], 带 click handler | 文本、位置、类型（提交/取消/操作） |
| **表格/列表** | table, [role=grid], 重复结构 | 列名、行数、是否有操作列 |
| **搜索/过滤** | input[type=search], 搜索图标旁输入框 | 搜索目标、过滤维度 |
| **分页** | .ant-pagination, [role=navigation] | 总页数、当前页 |
| **弹窗/抽屉** | Modal, Drawer, Dialog | 触发方式、内容类型 |
| **标签页/导航** | Tabs, Menu, Breadcrumb | 标签名、层级 |

---

## Step 3：交互分析

对 Step 2 识别的元素进行**有限度的交互探索**：

### 3.1 表单交互

```bash
# 尝试空提交
playwright-cli click <提交按钮ref>
playwright-cli snapshot  # 观察校验提示

# 填写有效数据后提交
playwright-cli fill <字段1ref> "测试数据"
playwright-cli fill <字段2ref> "test@example.com"
playwright-cli click <提交按钮ref>
playwright-cli snapshot  # 观察成功/失败结果
```

记录：
- 哪些字段必填（空提交后出现的校验提示）
- 提交成功后的页面变化（弹窗关闭、列表刷新、消息提示）
- 提交失败的错误信息

### 3.2 列表交互

```bash
# 搜索
playwright-cli fill <搜索框ref> "关键词"
playwright-cli snapshot  # 观察列表变化

# 分页
playwright-cli click <下一页ref>
playwright-cli snapshot

# 操作按钮
playwright-cli click <编辑按钮ref>
playwright-cli snapshot
```

记录：
- 搜索是实时触发还是需要按钮
- 分页后数据是否变化
- 操作按钮打开什么（弹窗、新页面、抽屉）

### 3.3 删除/危险操作

```bash
# 点击删除按钮
playwright-cli click <删除按钮ref>
playwright-cli snapshot  # 是否有确认弹窗

# 如果有确认弹窗，点击取消
playwright-cli click <取消按钮ref>
playwright-cli snapshot
```

记录：
- 是否有二次确认
- 确认弹窗的文案

---

## Step 4：推导测试场景

根据 Step 2-3 的探索结果，推导测试场景：

### 4.1 场景推导规则

| 页面元素 | 自动生成的场景 | slug 模式 | 优先级 |
|---------|--------------|----------|--------|
| 页面本身 | 页面正常加载，核心元素可见 | `{module}_page_loads` | P0 |
| 表单（新建） | 填写并提交成功 | `{module}_create_success` | P0 |
| 表单（新建） | 空提交显示校验提示 | `{module}_create_validation` | P1 |
| 表单（编辑） | 修改字段并保存 | `{module}_edit_success` | P1 |
| 列表/表格 | 列表正常显示数据 | `{module}_list_displays` | P0 |
| 搜索 | 搜索后列表过滤 | `{module}_search_filters` | P1 |
| 分页 | 翻页后数据切换 | `{module}_pagination_works` | P2 |
| 删除 | 删除确认并执行 | `{module}_delete_confirm` | P1 |
| 弹窗 | 打开和关闭 | `{module}_modal_open_close` | P2 |
| 导航/面包屑 | 点击跳转正确 | `{module}_navigation` | P2 |

### 4.2 场景命名规则

```
tea_id:  {module}_{slug}
title:   {页面名} — {场景中文描述}
file:    tests/e2e/{module}/test_{slug}.py
class:   Test{PascalCaseSlug}
func:    test_{slug}
```

---

## Step 5：生成脚本

为每个场景生成独立的 `.py` 文件。

### 5.1 脚本模板

```python
"""
test_{slug} — {场景中文描述}
Test ID: {module}-E2E-{seq}
Priority: {P0/P1/P2}
"""
import pytest
import re
from playwright.async_api import Page, expect
from tea_step import tea_step


# 页面常量
PAGE_URL = "{目标页面路径}"
LOGIN_URL = "/login"


class Test{PascalCaseSlug}:
    """{页面名}: {场景描述}"""

    async def _login(self, page: Page):
        """登录并导航到目标页面"""
        with tea_step("用户登录", phase="setup"):
            await page.goto(LOGIN_URL)
            await page.get_by_placeholder("{用户名placeholder}").fill("{USERNAME}")
            await page.get_by_placeholder("{密码placeholder}").fill("{PASSWORD}")
            await page.get_by_role("button", name="{登录按钮文本}").click()
            await page.wait_for_url("**/dashboard**")

    async def _navigate(self, page: Page):
        """导航到目标页面"""
        await self._login(page)
        with tea_step("导航到目标页面", phase="setup"):
            await page.goto(PAGE_URL)
            await page.wait_for_load_state("networkidle")

    @pytest.mark.asyncio
    async def test_{slug}(self, page: Page):
        await self._navigate(page)

        with tea_step("{操作描述}", phase="action"):
            {生成的操作代码}

        with tea_step("{预期结果描述}", phase="verify"):
            {生成的断言代码}
```

**tea_step 在 UI 测试中的使用规则**：
- 每个独立的用户操作用一个 `tea_step` 包裹
- 登录、导航等前置操作用 `phase="setup"`
- 核心交互（填表单、点击按钮）用 `phase="action"`
- 断言和验证用 `phase="verify"`
- UI 测试不会产生 HTTP 捕获（因为不走 httpx），步骤日志仅记录业务步骤名、phase、status、duration_ms

### 5.2 定位器优先级

生成脚本时，选择定位器的优先级（从高到低）：

| 优先级 | 定位器类型 | 示例 |
|--------|----------|------|
| 1 | Role + name | `page.get_by_role("button", name="新建")` |
| 2 | Label | `page.get_by_label("项目名称")` |
| 3 | Placeholder | `page.get_by_placeholder("请输入...")` |
| 4 | Text | `page.get_by_text("确认删除")` |
| 5 | Test ID | `page.get_by_test_id("submit-btn")` |
| 6 | CSS 选择器（最后手段） | `page.locator(".ant-btn-primary")` |

**禁止使用**：
- XPath（脆弱）
- 随机生成的 class 名
- 绝对位置索引（除非表格行）

### 5.3 断言模式

| 场景 | 断言代码 |
|------|---------|
| 元素可见 | `await expect(page.get_by_text("xxx")).to_be_visible()` |
| 元素存在 | `await expect(page.locator("xxx")).to_have_count(n)` |
| 输入值 | `await expect(page.get_by_label("xxx")).to_have_value("xxx")` |
| 页面跳转 | `await expect(page).to_have_url(re.compile(r"xxx"))` |
| 消息提示 | `await expect(page.get_by_text("操作成功")).to_be_visible()` |
| 列表数据 | `await expect(page.locator("tbody tr")).to_have_count(n)` |

### 5.4 等待策略

```python
# 页面加载完成
await page.wait_for_load_state("networkidle")

# 等待特定元素出现
await page.get_by_text("加载完成").wait_for(state="visible", timeout=10000)

# 等待网络请求完成
async with page.expect_response("**/api/xxx") as response_info:
    await page.get_by_role("button", name="提交").click()
response = await response_info.value
assert response.status == 200
```

### 5.5 输出路径

```
tests/e2e/{module}/test_{slug}.py
```

如果 `tests/e2e/{module}/` 目录不存在，先创建它和 `__init__.py`。

---

## Step 6：更新 tea-cases.json

与 API 测试生成规则一致：

1. 生成 `tea_id` = `{module}_{slug}`
2. `level` 设为 `"e2e"`
3. `type` 设为 `"e2e"`
4. **填写 `steps` 数组**：将脚本中每个 `tea_step` 转化为 `{action, expected, phase}` 记录，UI 步骤不带 `apiEndpoint`
5. **填写 `variables_used`**：列出脚本用到的环境变量（如 `APP_URL`、`USERNAME`、`PASSWORD`）
6. 添加 `"auto-generated"` 和 `"e2e"` tags
7. 更新 `summary` 统计

---

## Step 7：输出报告

```
## UI 测试脚本生成报告

### 探索页面: {页面URL}
### 模块: {module}

#### 页面元素识别
| 类别 | 数量 | 详情 |
|------|------|------|
| 表单 | {n} | {字段列表} |
| 按钮 | {n} | {按钮列表} |
| 表格 | {n} | {列名} |

#### 生成脚本清单
| # | 文件 | 场景 | 优先级 |
|---|------|------|--------|
| 1 | tests/e2e/{module}/test_{slug1}.py | {title1} | P0 |
| 2 | tests/e2e/{module}/test_{slug2}.py | {title2} | P1 |

#### 定位器统计
- Role/Label 定位: {n}（推荐）
- Text 定位: {n}
- CSS 选择器: {n}（需后续优化）

### tea-cases.json 更新: +{j} 条记录
```

---

## 与 explore-test 的关系

| | explore-test（已有） | generate-ui-tests（新增） |
|--|---------------------|-------------------------|
| **目的** | 一次性探索，发现缺陷 | 生成可重复执行的自动化脚本 |
| **产出** | `error.md` 缺陷报告 | `test_*.py` pytest 脚本文件 |
| **执行方式** | AI 手动操作页面 | AI 探索 → 生成脚本 → 脚本独立运行 |
| **可复现** | 不可复现（每次重新探索） | 可复现（脚本固化了操作步骤） |
| **平台集成** | 不集成 | 更新 tea-cases.json，平台可导入执行 |

**协作模式**：建议先用 `explore-test` 做一次探索发现缺陷，再用 `generate-ui-tests` 把核心场景固化为自动化脚本。

---

## Playwright 环境要求

脚本依赖以下环境（应已安装）：

```bash
pip install playwright pytest-playwright
playwright install chromium
```

conftest.py 中需要提供 `page` fixture（Playwright 已通过 pytest-playwright 自动提供）。

如果项目尚未配置 E2E 环境，需先在 `tests/e2e/conftest.py` 中添加：

```python
import pytest
from playwright.async_api import async_playwright


@pytest.fixture(scope="session")
async def browser():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        yield browser
        await browser.close()


@pytest.fixture
async def page(browser):
    page = await browser.new_page()
    yield page
    await page.close()
```
