# playwright-cli-agents 使用操作引导手册

**版本：** @playwright/test v1.56+（本项目已安装 v1.59.1）  
**适用客户端：** Claude Code  
**更新日期：** 2026-04-15

---

## 目录

1. [前置条件](#1-前置条件)
2. [初始化：一次性操作](#2-初始化一次性操作)
3. [核心概念：三段式流水线](#3-核心概念三段式流水线)
4. [Step 1 — Planner：探索并录制，生成可回放计划](#4-step-1--planner探索并录制生成可回放计划)
5. [Step 2 — Generator：按计划生成 POM 测试脚本](#5-step-2--generator按计划生成-pom-测试脚本)
6. [Step 3 — Healer：运行并自动修复失败用例](#6-step-3--healer运行并自动修复失败用例)
7. [配置定制](#7-配置定制)
8. [执行与报告（零 Token）](#8-执行与报告零-token)
9. [常见问题排查](#9-常见问题排查)
10. [快速参考卡](#10-快速参考卡)

---

## 1. 前置条件

### 1.1 环境要求

| 依赖 | 最低版本 | 验证命令 |
|------|---------|---------|
| Node.js | 18.x | `node --version` |
| @playwright/test | **1.56** | `npx playwright --version` |
| playwright-cli | 随 playwright-core 安装 | `playwright-cli --version` |
| Claude Code | — | `claude --version` |

> **提示：** 本项目已安装 `@playwright/test@1.59.1`，`playwright-cli` 已随 `playwright-core` 一并安装，无需额外安装步骤。

### 1.2 工具机制说明

CLI 版 Agent 使用 `playwright-cli` 命令直接控制浏览器，**无需 MCP Server**：

| 旧版（MCP） | 新版（CLI） |
|---|---|
| 需要 `.mcp.json` + MCP Server 常驻 | **无需** MCP 配置，即开即用 |
| `browser_snapshot` / `planner_setup_page` 等 MCP 工具 | `playwright-cli snapshot` / `playwright-cli open` 等 Bash 命令 |
| `generator_write_test` MCP 工具 | Claude Code `Write` 工具直接写入文件 |
| `test_run` / `test_debug` MCP 工具 | `npx playwright test` + `playwright-cli attach` |

### 1.3 Claude Code 准备

```bash
claude --version
claude auth status
```

---

## 2. 初始化：一次性操作

### 2.1 Agent 文件位置

CLI 版 Agent 定义文件已存放于 `.claude/agents/`，无需 `init-agents` 命令：

```
.claude/agents/
├── playwright-cli-test-planner.md     # Planner — 5 阶段探索 + TC 格式录制
├── playwright-cli-test-generator.md   # Generator — 4 条零容忍规则 + POM 模式
└── playwright-cli-test-healer.md      # Healer — CLI 调试附加修复
```

> 同目录还保留了旧版 MCP Agent（`playwright-test-*.md`）。使用 `playwright-cli-test-*` 前缀触发 CLI 版。

### 2.2 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 2.3 验证 playwright-cli 可用

```bash
playwright-cli open https://example.com
playwright-cli snapshot
playwright-cli close
```

---

## 3. 核心概念：三段式流水线

```
自然语言描述
"录制 AIGS 用户管理的测试"
        │
        ▼
┌──────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│    Planner       │────▶│      Generator       │────▶│      Healer       │
│                  │     │                      │     │                   │
│ Phase 1-2：      │     │ 读取 TC 格式计划      │     │ npx playwright    │
│ playwright-cli   │     │ 验证导航路径          │     │ test --debug=cli  │
│ 逐步操作，       │     │ 从步骤表构建          │     │                   │
│ 抄录 TS 输出     │     │ Page Object 类        │     │ playwright-cli    │
│                  │     │ 生成 .spec.ts         │     │ attach <session>  │
│ Phase 3-5：      │     │                      │     │ 定位根因，修复    │
│ 设计 TC，        │     │ 两类输出文件：        │     │ 选择器/断言       │
│ Write 保存计划   │     │ pages/XxxPage.ts      │     │                   │
│                  │     │ tests/suite/tc.spec   │     │                   │
└──────────────────┘     └──────────────────────┘     └───────────────────┘
        │                          │                           │
        ▼                          ▼                           ▼
  specs/plan.md            pages/XxxPage.ts            tests/xxx.spec.ts
  （TC 格式，可回放）       tests/xx/tc-01.spec.ts      （修复后版本）
```

**关键设计原则：**
- Planner 阶段把每条 `playwright-cli` 命令的 TypeScript 输出抄录进计划 → 计划直接可回放
- Generator 阶段无需重新探索，只验证导航路径后直接从计划构建代码
- 所有 Locator 来自真实浏览器操作输出，禁止推断发明

---

## 4. Step 1 — Planner：探索并录制，生成可回放计划

### 4.1 触发 Planner

```
使用 playwright-cli-test-planner Agent，
打开 https://aam-ai-dev.paraview.cn/，探索用户管理功能，
生成完整的测试计划并保存到 specs/user-management-plan.md
```

### 4.2 Planner 五阶段执行过程

| 阶段 | 操作 | 关键要求 |
|------|------|---------|
| **Phase 1** 导航与探索 | `playwright-cli open <url>` → `snapshot` → 逐个交互 | **每次** `playwright-cli` 命令执行后立即抄录打印的 TypeScript |
| **Phase 2** 录制导航操作 | 记录每个菜单点击的 TypeScript 输出 | 形成 `导航前置步骤` 代码块，末尾加页面加载断言 |
| **Phase 3** 设计测试用例 | 按功能区设计 Happy Path + 反向场景 | 覆盖 P0/P1/P2 优先级 |
| **Phase 4** 组装计划 | 用 Phase 1-2 收集的 TypeScript 填充步骤表 | `选择器/操作` 列**只允许**来自真实 playwright-cli 输出的代码 |
| **Phase 5** 保存计划 | `Write` 工具写入 markdown 文件 | 严格遵循 TC 格式 |

**核心规则：** 每条 `playwright-cli` 命令执行时会打印 TypeScript：
```bash
playwright-cli click e23
# 打印 → await page.getByRole('button', { name: '新建用户' }).click();
```
这行打印内容必须**原文抄录**进计划，Generator 将直接使用它生成代码，不会再次探索页面。

### 4.3 Planner 输出格式（TC 格式）

```markdown
# 测试计划：{模块路径}

> **版本：** v1.0  **生成时间：** YYYY-MM-DD
> **被测页面：** APP_URL → 导航路径  **测试框架：** Playwright + TypeScript

## 目录
1. [前置说明](#前置说明)
2. [TC-01 新增用户（正向）](#tc-01-新增用户正向)
...

## 前置说明

### 导航前置步骤（所有用例共用）
```typescript
// 来自 playwright-cli 真实操作的 TypeScript 输出（原文抄录）
await page.getByRole('menuitem', { name: '授权管理' }).click()
await page.getByRole('menuitem', { name: '用户管理' }).click()
await expect(page.getByRole('button', { name: '新增用户' })).toBeVisible()
```

### 测试数据规范
```typescript
const TS = Date.now()
const USER_NAME = `测试用户_${TS}`
const USER_CODE = `TEST_USER_${TS}`
```

## TC-01 新增用户（正向）

**用例编号：** TC-01 | **功能模块：** 新增用户 | **用例类型：** Happy Path | **优先级：** P0

### 操作步骤

| # | 操作描述 | 选择器 / 操作 |
|---|---------|-------------|
| 1 | 点击"新增用户"按钮 | `page.getByRole('button', { name: '新增用户' }).click()` |
| 2 | 断言：弹窗打开 | `expect(page.getByRole('dialog', { name: '新增用户' })).toBeVisible()` |
| 3 | 填写用户名 | `page.getByRole('textbox', { name: '用户名' }).fill(USER_NAME)` |
| 4 | 断言：用户出现在列表 | `expect(page.getByRole('row').filter({ hasText: USER_CODE })).toBeVisible()` |
```

### 4.4 设计场景覆盖范围

| 用例类型 | 优先级 | 说明 |
|---------|-------|------|
| Happy Path | P0 | 核心增删改查成功流程 |
| 反向-必填校验 | P1 | 必填字段为空时提交 |
| 反向-格式校验 | P1 | 非法格式输入 |
| 反向-唯一性校验 | P1 | 重复数据 |
| 反向-取消操作 | P2 | 弹窗取消，不保存 |
| 搜索/查询 | P1 | 精确、模糊、无结果、清空 |
| 分页操作 | P2 | 翻页、切换页码大小、边界页 |
| 批量操作 | P1 | 全选、批量启用/禁用/删除（如有） |

---

## 5. Step 2 — Generator：按计划生成 POM 测试脚本

### 5.1 触发 Generator

```
使用 playwright-cli-test-generator Agent，
按照 specs/user-management-plan.md 中的测试计划，
为 TC-01 到 TC-03 生成测试脚本
```

> **建议：** 每次只处理 **1~3 个 TC**，避免单次 Token 消耗过大。

### 5.2 四条零容忍规则

Generator 在生成每一行代码时严格遵守以下规则，**无例外**：

#### Rule 1 — 1:1 来自真实 playwright-cli 输出

所有 Locator、选择器、交互代码必须来自 `playwright-cli` 命令的实际打印输出，**禁止**从描述文字推断或凭记忆编写。计划步骤表的描述文字只是意图，不是代码来源。

#### Rule 2 — 选择器优先级（严格执行）

按以下优先级使用，找到第一个可用的就停止：

| 优先级 | Locator | 适用场景 |
|--------|---------|---------|
| 1（最高） | `page.getByRole(role, { name: '...' })` | 按钮、输入框、对话框、标题、行… |
| 2 | `page.getByLabel('...')` | 有关联 `<label>` 的表单字段 |
| 3 | `page.getByPlaceholder('...')` | 有 placeholder 的输入框 |
| 4 | `page.getByText('...')` | 非交互文本内容 |
| 5（最低） | `page.getByTestId('...')` | DOM 中明确存在 `data-testid` 时 |

**永久禁用（零例外）：**
- CSS 选择器：`.ant-btn`、`#submit`、`div > span`
- XPath：`//button[@type='submit']`、`xpath=...`
- 原生 JS：`page.evaluate(() => document.querySelector(...))`
- 无语义的纯位置定位：`page.locator('button').nth(2)`（除非确实无语义替代且有注释说明）

#### Rule 3 — 禁止硬等待

```typescript
// ❌ 禁止
await page.waitForTimeout(2000);
await new Promise(r => setTimeout(r, 1000));

// ✅ 使用 Playwright 内置自动等待
await expect(locator).toBeVisible();
await expect(locator).toBeEnabled();
await locator.waitFor({ state: 'visible' });
await page.waitForURL('**/target-path');
await page.waitForLoadState('domcontentloaded');
await page.waitForLoadState('networkidle');  // 页面有后台网络请求需要稳定时允许使用
```

#### Rule 4 — 所有输入值和断言值提取为变量

```typescript
// ❌ 禁止：直接硬编码
await rolePage.fillName('test_admin_001');
await expect(rolePage.nameCell).toHaveText('test_admin_001');

// ✅ 必须：提取为变量
const TS = Date.now()
const USER_NAME = `测试用户_${TS}`   // 来自计划的"测试数据规范"
await rolePage.fillName(USER_NAME);
await expect(rolePage.nameCell).toHaveText(USER_NAME);
```

需要提取为变量的内容：任何填写/选择的输入值、断言中使用的文本/URL/数字。  
不需要提取：locator 中的 role 字符串（`'button'`、`'dialog'`）、Playwright API 方法名。

**变量形式：**
- TC 格式计划（含 `测试数据规范` 块）→ 原样保留 `const TS = Date.now()` 形式，**不转为** `testData` 对象
- Suite/Test 格式计划 → 使用 `const testData = { ... } as const` 对象

### 5.3 POM 输出结构

每个 TC 产出**两类文件**：

```
pages/
└── {PageName}Page.ts          ← Page Object 类（新建或追加方法到已有文件）
tests/
└── {suite-kebab}/
    └── {tc-id}-{name}.spec.ts ← 使用 Page Object 的测试文件
```

**Page Object 文件模板：**
```typescript
import { Page, Locator } from '@playwright/test';

export class RolePage {
  readonly page: Page;
  // 所有 Locator 来自 playwright-cli 真实输出，以 readonly 字段声明
  readonly createButton: Locator;
  readonly createDialog: Locator;
  readonly nameInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // constructor 只做 locator 赋值，无 async 调用
    this.createButton = page.getByRole('button', { name: '新建角色权限' });
    this.createDialog = page.getByRole('dialog', { name: '新建角色权限' });
    this.nameInput    = page.getByRole('textbox', { name: '例如：部门管理员' });
  }

  async navigate() {
    // 来自计划的"导航前置步骤"代码块，原样抄录
    await this.page.getByRole('menuitem', { name: '授权管理' }).click();
    await this.page.getByRole('menuitem', { name: '角色权限定义' }).click();
  }

  async openCreateDialog() { await this.createButton.click(); }
  async fillName(name: string) { await this.nameInput.fill(name); }
}
```

**测试文件模板：**
```typescript
// spec: specs/plan.md
// tc: TC-01 | priority: P0

import { test, expect } from '@playwright/test';
import { RolePage } from '../../pages/RolePage';

// 来自计划的"测试数据规范"（原样抄录，不转 testData 对象）
const TS = Date.now()
const ROLE_NAME = `测试角色_${TS}`
const ROLE_CODE = `TEST_ROLE_${TS}`

test.describe('新增角色', () => {
  let rolePage: RolePage;

  test.beforeEach(async ({ page }) => {
    test.info().annotations.push({ type: 'priority', description: 'P0' });
    rolePage = new RolePage(page);
    await rolePage.navigate();
  });

  test('新增角色（正向）', async () => {
    // 1. 点击"新建角色权限"按钮
    await rolePage.openCreateDialog();
    // 断言：新建弹窗打开
    await expect(rolePage.createDialog).toBeVisible();
    // 3. 填写角色名称
    await rolePage.fillName(ROLE_NAME);
  });
});
```

**测试文件规则：**
- 测试体内**不得直接调用** `page.*` 交互方法，全部通过 Page Object 方法调用
- `expect(page).toHaveURL(...)` 是唯一允许的直接 page 断言
- Page Object 已存在时，**读取后只追加**缺失方法，不覆盖

### 5.4 Generator 执行流程（TC 格式）

```
1. 读取计划文件
   └─ 提取：测试数据规范 / 导航前置步骤 / 所有 TC-NN 步骤表

2. 检查已有 Page Object
   └─ ls pages/ → 如存在则读取，追加缺失方法

3. 验证导航路径（每个计划仅一次浏览器会话）
   playwright-cli open <APP_URL>
   # 执行导航前置步骤，确认目标页面可达
   playwright-cli snapshot → playwright-cli close

4. 从步骤表构建 Page Object
   └─ 提取唯一 Locator → readonly 字段
   └─ 分组为参数化方法

5. 生成各 TC 的 spec 文件
   └─ describe = 功能模块 | test = TC 标题 | 优先级注解

6. 写入文件（先 Page Object，后各 spec）
```

---

## 6. Step 3 — Healer：运行并自动修复失败用例

### 6.1 何时使用 Healer

- 运行 `npx playwright test` 出现失败用例
- Generator 生成的选择器不匹配实际 DOM
- 应用更新后原有测试失效
- 断言的期望值与实际不符

### 6.2 触发 Healer

```
使用 playwright-cli-test-healer Agent，
修复 tests/ 目录下所有失败的测试用例
```

```
# 修复单个文件
使用 playwright-cli-test-healer，
只修复 tests/新增角色/tc-01-新增角色-正向.spec.ts
```

### 6.3 Healer 七步工作流

```
Step 1 — 运行所有测试，获取失败列表
  PLAYWRIGHT_HTML_OPEN=never npx playwright test

Step 2 — 对每个失败用例，后台启动 CLI 调试会话
  PLAYWRIGHT_HTML_OPEN=never npx playwright test <file> --debug=cli
  # 等待输出：Debugging session: tw-abcdef12

Step 3 — 附加到调试会话，检查失败现场
  playwright-cli attach tw-abcdef12
  playwright-cli snapshot        # 当前页面结构
  playwright-cli console         # 控制台日志
  playwright-cli network         # 网络请求

Step 4 — 根本原因分析
  检查：选择器变更 / 时序问题 / 数据依赖 / 应用改版

Step 5 — 修改测试代码（Edit 工具）
  更新选择器 / 修复断言 / 使用正则处理动态数据

Step 6 — 验证修复结果
  PLAYWRIGHT_HTML_OPEN=never npx playwright test <file>

Step 7 — 循环直到全部通过
  仍无法修复 → test.fixme() + 注释说明当前实际行为
```

### 6.4 修复示例

**修复前（CSS 选择器失效）：**
```typescript
await page.locator('.ant-btn-primary').first().click();  // 页面改版后失效
```

**Healer 修复后（语义化选择器）：**
```typescript
await page.getByRole('button', { name: '新增角色权限' }).click();
```

**无法修复时（添加 fixme 标记）：**
```typescript
// TODO: 动态验证码无法自动处理，需人工介入
// 当前行为：验证码每次刷新，选择器无法稳定定位
test.fixme('包含验证码的登录流程', async ({ page }) => { ... });
```

### 6.5 Healer 成功率参考

| 失败原因 | 自动修复成功率 |
|---------|--------------|
| 选择器变更（CSS class 改变） | ~90% |
| 文本断言不匹配（版本/国际化） | ~80% |
| URL 路径变更 | ~75% |
| 时序问题（loading 未等待） | ~60% |
| 动态验证码 / 多步认证 | ~20%（通常标 fixme） |

---

## 7. 配置定制

### 7.1 定制 Agent 规则

在 Agent 定义文件末尾追加项目级自定义规则：

**Planner 定制**（`.claude/agents/playwright-cli-test-planner.md`）：
```markdown
## 项目规范
- 优先覆盖：新增、编辑、删除、查询四类 CRUD 操作
- 每个功能模块不超过 5 个 TC
- 每个 TC 必须包含：Happy Path（P0）+ 至少 1 个反向场景（P1）
```

**Generator 定制**（`.claude/agents/playwright-cli-test-generator.md`）：
```markdown
## 项目规范
- Page Object 文件统一放在项目根目录 pages/ 下
- 断言优先使用 toBeVisible() / toHaveURL()
- 每个导航操作后必须插入页面加载断言
```

### 7.2 环境变量配置

创建 `.env` 文件（**不提交到 git**）：
```bash
AIGS_URL=https://aam-ai-dev.paraview.cn/
TEST_USERNAME=admin
TEST_PASSWORD=your-password
```

在 `playwright.config.ts` 中加载：
```typescript
import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
dotenv.config()

export default defineConfig({
  use: { baseURL: process.env.AIGS_URL },
})
```

### 7.3 关于目标 URL

触发 Planner 和 Generator 时需在指令中明确提供目标 URL，因为 `playwright-cli open <url>` 需要显式地址：

```
使用 playwright-cli-test-planner，
打开 https://aam-ai-dev.paraview.cn/，探索角色管理页面
```

---

## 8. 执行与报告（零 Token）

生成脚本后所有执行操作为纯 Playwright，**不消耗任何 AI Token**。

### 8.1 基本执行命令

```bash
# 运行全部测试（推荐加此环境变量，避免自动弹出 HTML 报告）
PLAYWRIGHT_HTML_OPEN=never npx playwright test

# 运行指定文件
npx playwright test tests/新增角色/tc-01-新增角色-正向.spec.ts

# 运行指定目录
npx playwright test tests/新增角色/

# 模糊匹配用例名
npx playwright test -g "新增角色"

# 列出所有测试（不执行）
PLAYWRIGHT_HTML_OPEN=never npx playwright test --list

# 有头模式（可看到浏览器操作）
npx playwright test --headed

# 交互调试模式（每步暂停）
npx playwright test --debug
```

### 8.2 CLI 调试模式（配合 Healer 使用）

```bash
# 后台启动 CLI 调试会话
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/xxx.spec.ts --debug=cli
# 输出：Debugging session: tw-abcdef12

# 附加到会话
playwright-cli attach tw-abcdef12

# 此时可用 playwright-cli 命令检查页面
playwright-cli snapshot
playwright-cli console
playwright-cli eval "document.title"
```

### 8.3 查看测试报告

```bash
npx playwright show-report

# 开启 Trace 并查看
npx playwright test --trace on
npx playwright show-trace test-results/*/trace.zip
```

---

## 9. 常见问题排查

### Q1：`playwright-cli` 命令找不到

```bash
# 通过 npx 调用（不依赖 PATH）
npx playwright-cli snapshot

# 或检查安装
ls node_modules/.bin/playwright-cli
npm install playwright-core
```

### Q2：Planner 探索后，Generator 生成的选择器不可用

**原因：** Planner 在计划的 `选择器/操作` 列中写入了描述文字而非真实 TypeScript 输出。

**解决：** 重新触发 Planner，在指令中强调：
```
请确保步骤表中的"选择器/操作"列全部使用 playwright-cli 命令实际打印的 TypeScript 输出，
不允许推断或手写 locator
```

### Q3：Generator 生成的测试立即失败（找不到元素）

| 原因 | 解决方法 |
|------|---------|
| 导航路径变更 | Generator 会验证导航，若失败会报告；重新触发并检查菜单路径 |
| 选择器依赖动态 class | Healer 修复；或在 Generator 规则中追加"禁止 CSS 选择器" |
| 操作太快，元素未加载 | Healer 会自动添加等待；或在 Page Object 方法中加 `waitFor` |
| 测试数据冲突 | 检查计划的 `测试数据规范` 是否使用了 `Date.now()` |

### Q4：Healer 无法附加到调试会话

```bash
# 确认使用 --debug=cli（而非 --debug）
PLAYWRIGHT_HTML_OPEN=never npx playwright test tests/xxx.spec.ts --debug=cli
# 等待打印 Debugging session: tw-xxxxxxxx
playwright-cli attach tw-xxxxxxxx
```

### Q5：Healer 修复后测试仍然失败

```bash
# 查看 HTML 报告和截图
npx playwright test --reporter=html
npx playwright show-report

# 查看详细 Trace
npx playwright test --trace on
npx playwright show-trace test-results/*/trace.zip
```

### Q6：Token 消耗过大

```
# 不推荐（一次生成整个计划）
使用 playwright-cli-test-generator 生成 specs/plan.md 中的所有测试

# 推荐（分批，每批 1~2 个 TC）
使用 playwright-cli-test-generator 只生成 TC-01 这一个场景
```

---

## 10. 快速参考卡

### 完整工作流（四步走）

```bash
# ── 环境准备（一次性）────────────────────────────────────────
npm install && npx playwright install chromium

# ── Step 1：Planner 探索 + 录制（Claude Code 中输入）────────
"使用 playwright-cli-test-planner，
 打开 https://aam-ai-dev.paraview.cn/，探索角色管理功能，
 生成测试计划到 specs/role-plan.md"

# ── Step 2：Generator 生成 POM 脚本（Claude Code 中输入）────
"使用 playwright-cli-test-generator，
 按 specs/role-plan.md 生成 TC-01 到 TC-03 的测试脚本"

# ── Step 3：执行测试（命令行，零 Token）──────────────────────
PLAYWRIGHT_HTML_OPEN=never npx playwright test
npx playwright show-report

# ── Step 4：Healer 修复（测试失败时，Claude Code 中输入）────
"使用 playwright-cli-test-healer，修复所有失败的测试用例"
```

### playwright-cli 常用命令速查

| 操作 | 命令 |
|------|------|
| 打开浏览器 | `playwright-cli open <url>` |
| 截取页面快照 | `playwright-cli snapshot` |
| 点击元素 | `playwright-cli click <ref>` |
| 输入文本 | `playwright-cli type "<text>"` |
| 悬停 | `playwright-cli hover <ref>` |
| 按键 | `playwright-cli press <Key>` |
| 下拉选择 | `playwright-cli select <ref> "<value>"` |
| 处理对话框 | `playwright-cli dialog-accept` / `dialog-dismiss` |
| 执行表达式 | `playwright-cli eval "<expression>"` |
| 关闭浏览器 | `playwright-cli close` |
| 附加调试会话 | `playwright-cli attach <session-id>` |
| 查看控制台 | `playwright-cli console` |
| 查看网络请求 | `playwright-cli network` |

### npx playwright 常用命令速查

| 操作 | 命令 |
|------|------|
| 运行全部测试 | `PLAYWRIGHT_HTML_OPEN=never npx playwright test` |
| 运行单个文件 | `npx playwright test tests/xxx.spec.ts` |
| 模糊匹配用例 | `npx playwright test -g "关键字"` |
| 列出所有用例 | `PLAYWRIGHT_HTML_OPEN=never npx playwright test --list` |
| 有头模式 | `npx playwright test --headed` |
| 交互调试 | `npx playwright test --debug` |
| CLI 调试模式 | `PLAYWRIGHT_HTML_OPEN=never npx playwright test <file> --debug=cli` |
| 查看报告 | `npx playwright show-report` |
| 开启 Trace | `npx playwright test --trace on` |
| 查看 Trace | `npx playwright show-trace <trace.zip>` |

### Agent 触发词参考

| Agent | 触发词 | 输出 |
|-------|--------|------|
| Planner | `使用 playwright-cli-test-planner，打开 <url>，探索 <功能>` | TC 格式计划（`.md`） |
| Generator | `使用 playwright-cli-test-generator，按 <plan> 生成 TC-xx` | `pages/XxxPage.ts` + `tests/xx/tc-xx.spec.ts` |
| Healer | `使用 playwright-cli-test-healer，修复 <文件/目录>` | 修复后的 `.spec.ts` 和 Page Object |

### Token 消耗参考

| 操作 | 消耗 | 备注 |
|------|------|------|
| Planner 探索一个功能模块 | ~20k~40k tokens | 需逐个操作并抄录 TS 输出 |
| Generator 生成一个 TC（TC 格式） | ~10k~20k tokens | 仅需验证导航，不重新探索 |
| Generator 生成一个场景（Suite 格式） | ~20k~30k tokens | 需逐步执行每个操作 |
| Healer 修复一个失败用例 | ~10k~20k tokens | 视失败复杂度而定 |
| 执行已生成的测试 | **0 tokens** | 纯 Playwright 执行 |

---

## 附录：项目文件说明

```
playwright-agents-used/
├── playwright.config.ts                  # Playwright 配置
├── pages/                                # Page Object 文件（Generator 写入）
│   └── {PageName}Page.ts
├── specs/                                # 测试计划（Planner 输出，TC 格式）
│   └── {module}-plan.md
├── tests/                                # 测试脚本（Generator 写入，POM 模式）
│   └── {suite-kebab}/
│       ├── tc-01-{name}.spec.ts
│       └── tc-02-{name}.spec.ts
└── .claude/agents/
    ├── playwright-cli-test-planner.md    # Planner：5 阶段 + TC 格式录制
    ├── playwright-cli-test-generator.md  # Generator：4 条零容忍规则 + POM
    └── playwright-cli-test-healer.md     # Healer：CLI 调试附加修复
```
