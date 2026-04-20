# ui-recorder SKILL 使用手册

## 概述

`ui-recorder` 是一个基于 `playwright-cli` 的 UI 自动化测试技能，支持两种工作模式：

| 触发词 | 模式 | 产出 |
|--------|------|------|
| `探索页面：` | **自动探索模式** | 增强元素字典（选择器 + 校验行为 + 字段约束） |
| `录制测试：` | **录制模式** | Playwright `.spec.ts` 测试脚本 |

---

## SKILL 存放目录与使用方式

### 存放目录

```
~/.claude/skills/
└── ui-recorder/
    └── SKILL.md        ← SKILL 定义文件
```

Claude Code 启动时自动加载 `~/.claude/skills/` 下所有技能，无需额外配置。

### 使用方式

**模式一：自动探索**

```
探索页面：<页面名称>
目标 URL：<起始页面地址>
输出字典：specs/page-elements/<page-name>.md
```

**模式二：录制测试**

```
录制测试：<自然语言任务描述>
目标 URL：<起始页面地址>
输出路径：<生成脚本路径，如 scripts/login.spec.ts>
```

Claude Code 会自动识别触发词并进入对应模式。

### 安装依赖（首次使用前）

```bash
# 全局安装 playwright-cli
npm install -g @playwright/cli

# 验证安装
playwright-cli --version

# 安装测试框架（执行脚本用）
npm install @playwright/test --save-dev

# 安装 Playwright 浏览器
npx playwright install chromium
```

---

## 模式一：自动探索模式

### 算法流程

1. 启动浏览器，完成登录和页面导航
2. **列表页全量扫描**：识别工具栏按钮、搜索框、下拉框、Tab 页签、行操作按钮、分页控件，建立探索队列
3. **BFS 广度优先探索**：逐一点击每个入口，snapshot 记录元素，识别子入口，恢复基础状态
4. **校验行为采集**：对每个输入字段做必填校验、格式校验，记录 alert/表单提示内容
5. **联动检测**：切换 combobox/radio/checkbox，通过前后 snapshot 差量找联动字段
6. 关闭浏览器，输出增强元素字典

### 探索终止条件

- 队列为空（所有发现的状态均已访问）
- 同一路径探索深度 > 3 层
- 同结构弹窗已探索过（只记录一次差异）

### 输出字典格式

```markdown
# 页面元素字典：<模块> > <页面名>

> 生成方式：ui-recorder 自动探索
> 更新时间：YYYY-MM-DD
> 页面地址：<URL>

## 一、导航路径
## 二、列表页元素（工具栏 / 行操作 / 分页）
## 三、<弹窗名>弹窗（字段选择器，标注 ✅ 已确认 / ⚠️ 待探索）
## 四、校验行为（字段 | 校验类型 | 触发方式 | 实际提示内容）
## 五、字段约束（maxlength / pattern）
## 六、联动规则（触发元素 | 触发值 | 变化类型 | 受影响字段）
```

### 选择器规范（字典内必须遵守）

| 优先级 | 选择器 | 示例 |
|--------|--------|------|
| 1（最稳定） | `data-testid` | `page.getByTestId('submit-btn')` |
| 2 | aria-label | `page.getByLabel('用户名')` |
| 3 | role + name | `page.getByRole('button', { name: '登录' })` |
| 4 | placeholder | `page.getByPlaceholder('请输入...')` |
| 5 | 可见文字 | `page.getByText('确认')` |
| 6（兜底） | title 属性 | `page.locator('button[title="删除"]')` |

**严格禁止**写入字典的选择器：
- ❌ CSS class 选择器（`.ant-btn`）
- ❌ XPath 选择器
- ❌ `page.evaluate()` 执行原生 JS 点击
- ❌ 数字索引 `nth(0)` 作为唯一定位手段

**等待策略规范**（字典和生成脚本均须遵守）：

```typescript
// ✅ 软等待（正确）
await expect(locator).toBeVisible()
await locator.waitFor({ state: 'visible' })
await page.waitForLoadState('domcontentloaded')

// ❌ 硬等待（禁止）
await page.waitForTimeout(N)
```

**导航路径写法（必须用 getByRole）**：

```typescript
// ✅ 正确
await page.getByRole('menuitem', { name: 'lock 授权管理' }).click()
await page.getByRole('menuitem', { name: '关系型权限策略' }).waitFor({ state: 'visible' })
await page.getByRole('menuitem', { name: '关系型权限策略' }).click()

// ❌ 错误（禁止写入字典）
await page.evaluate(() =>
  document.querySelectorAll('.ant-menu-submenu-title')[0].click()
)
```

**弹窗内元素必须限定作用域**：

```typescript
// ✅ 正确
page.getByRole('dialog', { name: '弹窗标题' }).getByRole('button', { name: '确定' })

// ❌ 错误（未限定）
page.getByRole('button', { name: '确定' })
```

---

## 模式二：录制测试模式

### 内置能力

| 能力 | 说明 |
|------|------|
| 感知 → 决策 → 执行 → **记录** 循环 | 每步先 snapshot 获取 Accessibility Tree，再决定操作，立即记录生成代码 |
| **1:1 还原** | 脚本代码直接来自 `Ran Playwright code` 输出，禁止推断 |
| 重试机制 | 元素未找到时最多重试 3 次（re-snapshot → eval DOM → 部分脚本） |
| 表单变量提取 | 所有 fill/select/check 值自动提取为顶部具名常量 |
| 强制断言 | 新增/编辑/删除/启用/停用/查询/弹窗打开关闭后自动插入断言 |
| 部分脚本生成 | 录制中断时，已完成部分保留，失败处插入 `⚠️ TODO` 注释 |

### 录制流程

**第一步**：启动浏览器，创建日志文件
```bash
mkdir -p .tmp
playwright-cli open <目标URL>
```

启动后立即写入日志文件 `.tmp/recording-log.md`（头部）：

```markdown
# 录制操作日志
- 任务描述：<任务>
- 目标 URL：<URL>
- 录制时间：<YYYY-MM-DD HH:mm>
- 输出路径：<spec 路径>
---
```

> **必须写文件的原因**：日志若只存在于对话上下文，对话压缩或中断后即丢失，之后只能凭记忆推断——这是 1:1 录制原则的根本威胁。写入文件后可永久查阅、断点续录、逐行溯源。

**第二步**：感知 → 决策 → 执行 → **写日志** 循环
```bash
playwright-cli snapshot --depth=5          # 获取 Accessibility Tree
playwright-cli click <ref>                 # 点击
playwright-cli fill <ref> "<内容>"         # 填写
playwright-cli select <ref> "<选项>"       # 下拉选择
playwright-cli check <ref>                 # 勾选
playwright-cli press Enter                 # 按键
playwright-cli dialog-accept               # 接受 alert/confirm
playwright-cli dialog-dismiss              # 拒绝 confirm
playwright-cli screenshot --filename=.tmp/step.png  # 截图验证
```

**重要**：每次命令执行后 ref 会更新，必须重新 snapshot 获取最新 ref。

#### ⚡ 实时写日志规则（核心约束）

每条 playwright-cli 命令执行后，**立即将 `Ran Playwright code` 块追加写入 `.tmp/recording-log.md`**：

```markdown
## [步骤 N] <操作描述>

**录制代码：**
```typescript
await page.getByRole('menuitem', { name: '关系型权限策略' }).click()
```
**输入值：** -
**断言：** `await expect(dialog).toBeVisible()`
**备注：** （如有选择器升级说明）

---
```

**三条铁律：**

| 规则 | 说明 |
|------|------|
| 先写日志再执行下一步 | 每条命令执行完立即写，不攒批 |
| 无 `Ran Playwright code` 时写等价代码 | `dialog-accept` → `page.once('dialog', d => d.accept())`（须注明写在触发操作前） |
| 日志无记录则脚本不得出现该步骤 | 缺失步骤插入 `// ⚠️ [日志缺失]` 注释，不补写推断代码 |

**CSS class 选择器升级**：若 `Ran Playwright code` 输出了 CSS class 选择器（如 `div:nth-child(4) > .peer`），在日志中同步记录升级后的语义选择器，并在备注中说明：

```markdown
**备注：** [选择器升级] 原始录制代码为 `div:nth-child(4) > .peer`（CSS class），
已根据 snapshot 中 `generic [cursor=pointer]` 结构升级为：
`page.locator('div.cursor-pointer').filter({ hasText: 'lijh' }).first().getByRole('checkbox').click()`
```

**第三步**：关闭浏览器
```bash
playwright-cli close
```

**第四步**：从日志文件组装 `.spec.ts`

读取 `.tmp/recording-log.md`，按步骤顺序将每条「录制代码」逐行复制到脚本中。
若某步骤在日志中无对应记录，插入注释 `// ⚠️ [日志缺失] 步骤 N`，不得补写推断代码。

**生成脚本的铁律：**

| ✅ 允许 | ❌ 禁止 |
|--------|--------|
| 直接复制日志文件中的录制代码 | 根据 UI 外观推断 role 类型（如猜测是 `tab` 还是 `button`）|
| 从 snapshot 读取 placeholder 文字再写入日志 | 凭记忆填写 placeholder 字符串 |
| eval 批量操作封装为 `page.evaluate()`（已在日志记录） | 对日志中无记录的步骤补写代码 |
| 日志有歧义时重新打开浏览器验证后更新日志 | 跳过验证直接输出"推断正确"的代码 |

### 元素未找到时的重试机制

1. **第 1 次失败**：重新 `snapshot --depth=5`，用新 ref 或语义选择器重试
2. **第 2 次失败**：用 `eval` 查询 DOM 属性辅助确认元素是否存在
3. **第 3 次失败**：停止录制，生成部分脚本，在失败处插入中断注释：

```typescript
// ⚠️ [录制中断] 第 N 步操作失败，已重试 3 次
// 失败原因：<命令报错信息或"元素未在 Accessibility Tree 中找到">
// 失败操作：<尝试执行的操作描述>
// 建议处理：
//   1. 手动检查该步骤的选择器
//   2. 若元素在弹窗/iframe 内，需先切换上下文
//   3. 若页面有加载延迟，使用软等待：
//      await expect(locator).toBeVisible({ timeout: 10000 })
// TODO: 补充此步骤后继续下方未录制的操作
```

### 常见场景处理

**多级菜单导航：**
```bash
playwright-cli click "getByRole('menuitem', { name: '授权管理' })"
playwright-cli click "getByRole('menuitem', { name: '角色权限定义' })"
```

**弹窗中的操作：**
```bash
playwright-cli snapshot --depth=5
playwright-cli click "getByRole('dialog', { name: '弹窗标题' }).getByRole('button', { name: '确定' })"
```

**表格行操作按钮（无文字、仅有 title）：**
```bash
playwright-cli eval "Array.from(document.querySelectorAll('tr')[1].querySelectorAll('button')).map((b,i)=>({i, title: b.title}))"
playwright-cli click "getByRole('row').filter({ hasText: '行内容' }).first().locator('button[title=\"操作名\"]')"
```

**表格全选（含分页处理）：**
```bash
playwright-cli click "getByRole('combobox')"
playwright-cli click "getByRole('option', { name: '50条/页' })"
playwright-cli click "getByRole('dialog', { name: '弹窗名' }).locator('thead input[type=\"checkbox\"]')"
```

**系统原生 alert/confirm：**
```bash
playwright-cli dialog-accept    # 接受
playwright-cli dialog-dismiss   # 拒绝
```

**元素不在 Accessibility Tree 时（复杂组件）：**
```bash
playwright-cli eval "Array.from(document.querySelectorAll('button')).map(b => ({text: b.innerText, title: b.title}))"
```

### 生成脚本规范

#### 表单变量提取规则

所有填写到表单的值**必须提取为顶部具名变量**：

```typescript
// ✅ 正确
const USERNAME = 'sysadmin'
const PASSWORD = '123456'
const ROLE_NAME = 'test_role'

await page.getByPlaceholder('请输入用户名').fill(USERNAME)

// ❌ 错误（硬编码）
await page.getByPlaceholder('请输入用户名').fill('sysadmin')
```

变量命名规则：全大写 + 下划线，放在 `test()` 块之前紧跟 `import` 语句。

#### 强制断言规则

| 操作类型 | 触发条件 | 断言内容 |
|---------|---------|---------|
| **新增** | 点击"新增/创建/添加/保存"后 | 断言新数据出现在列表 |
| **编辑** | 点击"保存/更新/确认"后 | 断言修改后的值显示 |
| **删除** | 点击"删除/移除"并确认后 | 断言目标数据不再出现 |
| **启用** | 点击"启用"后 | 断言状态标签变为"启用" |
| **停用/禁用** | 点击"停用/禁用"后 | 断言状态标签变为"停用" |
| **查询/搜索** | 点击"搜索/查询"后 | 断言结果包含预期数据 |
| **登录** | 点击"登录"后 | 断言 URL 跳转 |
| **弹窗打开** | 点击触发弹窗的按钮后 | `toBeVisible()` |
| **弹窗关闭** | 点击弹窗内取消/关闭/确定后 | `not.toBeVisible()` |

断言模板：

```typescript
await expect(page.getByRole('row').filter({ hasText: ROLE_NAME })).toBeVisible()           // 新增
await expect(page.getByRole('row').filter({ hasText: TARGET_NAME })).not.toBeVisible()     // 删除
await expect(page.getByRole('dialog', { name: '弹窗标题' })).toBeVisible()                 // 弹窗打开
await expect(page.getByRole('dialog', { name: '弹窗标题' })).not.toBeVisible({ timeout: 5000 })  // 弹窗关闭
await expect(page.getByText(/共 \d+ 条/)).toBeVisible()                                    // 查询结果
```

#### 脚本完整模板

```typescript
/**
 * 自动生成的 Playwright 测试脚本
 * 录制时间：<时间>
 * 任务描述：<任务>
 */
import { test, expect } from '@playwright/test'

// ── 表单变量 ──────────────────────────────────────────────────────────────────
const USERNAME = 'sysadmin'
const PASSWORD = '123456'
const ROLE_NAME = 'test_role'
// ──────────────────────────────────────────────────────────────────────────────

test('<测试名称>', async ({ page }) => {
  await page.goto('<URL>')

  await page.getByPlaceholder('<用户名占位符>').fill(USERNAME)
  await page.getByPlaceholder('请输入密码').fill(PASSWORD)
  await page.getByText('登录', { exact: true }).click()
  await expect(page).toHaveURL(/<登录后URL片段>/)

  await page.getByRole('menuitem', { name: '<菜单名>' }).click()

  await page.getByRole('button', { name: '新建' }).click()
  await expect(page.getByRole('dialog', { name: '<弹窗名>' })).toBeVisible()

  await page.getByRole('textbox', { name: '<字段名>' }).fill(ROLE_NAME)
  await page.getByRole('button', { name: '创建' }).click()
  await expect(page.getByRole('row').filter({ hasText: ROLE_NAME })).toBeVisible()

  // 处理原生 alert（在触发操作前注册）
  page.on('dialog', dialog => dialog.accept())
})
```

---

## 使用提示词样例

### 场景一：探索页面元素字典

```
探索页面：授权管理 > 角色权限定义
目标 URL：https://aam-ai-dev.paraview.cn/console/
用户/密码：sysadmin/Parav1ew!
输出字典：specs/page-elements/role-policy.md
探索以下场景：
1、新建角色
2、编辑角色
3、绑定资源
```

### 场景二：单任务录制（基础登录 + 新增）

```
录制测试：使用 sysadmin / 123456 登录管理后台，
          进入用户管理列表，新增用户 test_user，
          断言列表中出现该用户
目标 URL：http://192.168.10.25:8088/
输出路径：playwrightdemo/scripts/add-user.spec.ts
```

### 场景三：带弹窗的复杂表单操作

```
录制测试：
  1. sysadmin / 123456 登录
  2. 进入授权管理 > 角色权限定义
  3. 新建角色，名称=test_role，编码=test_role，点击创建
  4. 找到 test_role 行，点击绑定资源
  5. 在弹窗中点击"选择资源"，搜索"用户管理"，全选，确定，保存
  6. 断言绑定资源弹窗已关闭
目标 URL：http://192.168.10.25:8088/
输出路径：playwrightdemo/scripts/add-role.spec.ts
```

### 场景四：CRUD 完整流程

```
录制测试：
  登录：sysadmin / 123456

  【新增】进入角色权限定义，新建角色 crud_role / crud_role
  【编辑】找到 crud_role 行，点击编辑，修改名称为 crud_role_v2，保存
  【查询】搜索 crud_role_v2，断言结果包含该角色
  【删除】找到 crud_role_v2 行，点击删除，确认，断言列表中不再出现该角色

  每个操作完成后均需插入对应断言。

目标 URL：http://192.168.10.25:8088/
输出路径：playwrightdemo/scripts/crud-role.spec.ts
```

### 场景五：录制结束后发送给下游 Agent

```
探索页面：授权管理 > 关系型权限策略
目标 URL：https://aam-ai-dev.paraview.cn/console/
用户/密码：sysadmin/Parav1ew!
输出字典：specs/page-elements/RBAC.md
探索以下场景：
1、新增关系型策略
2、关系型策略绑定ABAC条件

将探索结果发送给 @playwright-test-planner
将@playwright-test-planner结果，发送给 @playwright-test-generator
```

### 场景六：批量录制多个脚本

```
请依次录制以下 3 个测试脚本：
- 目标 URL：http://192.168.10.25:8088/
- 账号：sysadmin / 123456

任务1 → 输出 scripts/add-role.spec.ts
  进入授权管理 > 角色权限定义
  新建角色 role_A / role_A，断言列表出现 role_A

任务2 → 输出 scripts/bind-resource.spec.ts
  找到 role_A 行，点击"绑定资源"
  在弹窗中点击"选择资源"，搜索"用户管理"，50条/页，全选，确定，保存
  断言绑定资源弹窗关闭

任务3 → 输出 scripts/delete-role.spec.ts
  找到 role_A 行，点击删除，确认弹窗
  断言列表中不再出现 role_A

执行规则：按顺序执行，单个失败跳过不中断后续，完成后汇总结果。
```

### 场景七：录制中断后补充 TODO

```
playwrightdemo/scripts/add-role.spec.ts 中有未完成的 TODO 步骤，
请继续录制从 TODO 处开始的操作：

目标 URL：http://192.168.10.25:8088/
继续任务：在"选择资源"弹窗中完成全选并保存
在原文件 TODO 注释处补充录制代码，不要重写已完成部分。
```

---

## 执行生成的脚本

```bash
cd playwrightdemo

# 执行单个脚本
npx playwright test scripts/add-role.spec.ts
npx playwright test scripts/add-role.spec.ts --headed   # 有头模式

# 执行所有脚本
npx playwright test

# 查看 HTML 报告
npx playwright show-report reports
```

---

## 注意事项

- **登录已由 fixtures 处理**：若项目使用 `tests/fixtures.ts`，导入 `{ test, expect }` 时无需手动登录步骤
- **数据依赖顺序**：批量任务中删除要排在新增之后
- **重复执行**：脚本默认不含清理逻辑，重复执行前需修改变量值或手动删除测试数据
- **元素 ref 失效**：每次 snapshot 后 ref 会更新，录制期间不可跨步骤复用 ref
- **弹窗内操作**：需在 snapshot 后使用 `getByRole('dialog', { name: '...' })` 限定作用域
- **探索模式不产生脏数据**：校验行为采集后必须点取消，不保存表单
