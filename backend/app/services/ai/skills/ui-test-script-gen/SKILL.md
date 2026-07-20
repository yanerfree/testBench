---
name: ui-test-script-gen
description: >
  从功能测试用例的步骤与预期，生成可执行、可复用的 Playwright Test 脚本（.spec.ts）。
  用于把手工用例转成自动化 UI 脚本。
license: MIT
compatibility: 需要 Playwright MCP 连接（浏览器工具）
allowed-tools: browser_navigate browser_click browser_type browser_fill browser_select_option browser_hover browser_press_key browser_snapshot browser_take_screenshot browser_wait_for browser_evaluate browser_close submit_script verify_script
---

# UI 测试脚本生成

你在把一条功能测试用例转成 Playwright Test 脚本（TypeScript `.spec.ts`）。严格按下面执行。

## 输入
- **用例标题**：验证什么
- **测试步骤**：每步有操作描述与预期
- **整体预期结果**
- **被测应用地址（Base URL）**：仅用于浏览器探索，**不要硬编码进脚本**
- **前置条件**：环境前置（如已登录）与业务数据前置

## 最高优先约束：只做用例要求的事（Scope Discipline）
**只探索、只测试用例步骤描述的操作。** 不要：
- 测步骤没提到的功能
- 验证预期之外的实现细节
- 探索不在流程里的页面
- 为"更了解页面"绕路

## 三阶段工作流（必须遵守）

### 阶段一：浏览器探索（约 60% 精力）
目标：在真实浏览器里走一遍用例步骤，记录选择器并验证结果。**只截图、不录像。**

0. **先 `browser_close`** 关闭任何残留会话（第一步）。
1. **如需登录**（顺序执行，不要并行填表单）：
   - `browser_navigate` → Base URL（应用会自动跳登录页，不要手动拼 /login）
   - `browser_snapshot` 看真实页面结构，拿元素 ref 和 accessible name
   - `browser_fill` 用户名（按 snapshot 里的真实 ref/name 定位），填 `TEST_USER`
   - `browser_fill` 密码，填 `TEST_PASSWORD`
   - `browser_click` 登录按钮
   - ⚠️ 登录页常同时有「登录」和「企业 SSO 登录/其它登录」按钮，脚本里点登录**必须用精确名** `getByRole('button', { name: '登录', exact: true })`，不要用 `/登录/` 正则（会 strict mode 命中多个）
   - 等 URL 离开登录页
   - ⚠️ 若登录后仍停在登录页（凭据错），立即停止探索，在结论里注明凭据无效，**不要循环重试**
2. **逐步执行每个测试步骤**：执行操作 → `browser_snapshot` 记录选择器 → 仅在关键节点（页面加载/表单提交/最终态）截图 → 验证预期。

### 阶段二：生成脚本（约 30% 精力）
按阶段一记录的**真实选择器**生成脚本，遵循 `script-spec.md`：
- `import { test, expect } from '../fixtures'`，**不要**从 `@playwright/test` 导入
- 用 `page` fixture，**登录逻辑写在 test body 顶部**（用阶段一探到的真实登录选择器）。凭据用 `process.env.TEST_USER!` / `process.env.TEST_PASSWORD!`，**禁止**写死账号密码或 `|| 'admin'` 兜底
- `page.goto()` 用**相对路径**，不要硬编码绝对 URL
- **阶段一每一步操作都要在脚本里体现**：如点按钮后弹出菜单再选项，脚本必须含"点按钮 + 点菜单项"两个动作，不能跳中间步骤
- 每个步骤至少一条断言；用 `await expect(locator).toBeVisible()` 这类，**不要** `waitForTimeout` 死等
- 断言必须对齐用例预期（Toast 文案、页面跳转、列表/状态变化），**禁止**永真断言、`try/catch` 吞错、注释掉步骤

### 阶段三：提交并验证（约 10% 精力）
1. `submit_script` 提交完整脚本内容
2. `verify_script` 验证（无需传参）
3. 处理结果：
   - **VERIFICATION PASSED** → 完成，输出简短总结并停止
   - **VERIFICATION FAILED** → 先做错误分诊（见下），该改脚本才改，改完重新 submit→verify
   - **最多 3 轮** submit→verify，用完即止

## 选择器策略（核心，别随手写）
优先级从高到低：**testId → role(getByRole) → label/placeholder → text → css**。
- 表单输入用 `browser_fill`（清空后填），**不要** `browser_type`（会追加）
- 多字段顺序填，不要并行
- 选择器一律用阶段一**当时真正命中的那个**，阶段二直接抄，不要重新发明
- `strict mode violation`（命中多个）→ 加 `.first()` 或用父级 locator 缩小范围
- 关键交互显式设短超时（≤5s），不要用默认 30s 闷等

### ⚠️ 列表/表格里的状态断言（最易翻车，必须遵守）
像「运行中 / 已禁用 / 已弃用 / 草稿」这类**状态文字会在列表里出现很多行**（每行一个），`getByText('运行中')` 会命中一大片 → strict mode violation。**绝对不要**直接断言这种全局状态文字。正确做法：**先用唯一标识（本次操作的服务名）定位到那一行，再在行内断言状态**：
```typescript
// ❌ 错：全页多行都有"运行中"，命中 N 个必崩
await expect(page.getByText('运行中', { exact: true })).toBeVisible();

// ✅ 对：先按服务名锁定本行，再在行内验状态
const row = page.getByRole('row').filter({ hasText: serviceName });
await expect(row).toBeVisible({ timeout: 8000 });
await expect(row).toContainText('已禁用');
```
如果列表没有稳定的行标识，就先用搜索框过滤出目标（`搜索框.fill(serviceName)`）再断言。**任何"列表里某项的状态"断言，都必须先锁定到该项所在行/卡片，禁止对状态文字全局 getByText。**

## 登录（仅探索阶段你手动做；脚本里写成 test body 内联登录）
被测应用登录页布局各异，**务必先 `browser_snapshot`** 拿真实 ref/name 再操作，不要用硬编码选择器。凭据来自 prompt 的 `登录账号`/`登录密码`（即 `TEST_USER`/`TEST_PASSWORD`，执行器会注入这两个环境变量，名字**只能是这两个**，别造 `TEST_USERNAME` 之类）。

示例——若步骤是「1.登录 2.进用户管理 3.创建用户」，脚本从登录写起：
```typescript
import { test, expect } from '../fixtures';

test('创建新用户', async ({ page, cleanup }) => {
  // 登录（用阶段一探到的真实选择器）
  await page.goto('/');
  await page.getByPlaceholder('请输入用户名').fill(process.env.TEST_USER!);
  await page.getByPlaceholder('请输入密码').fill(process.env.TEST_PASSWORD!);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(u => !/login|signin/i.test(u.href), { timeout: 20000 });

  // 步骤2：进用户管理
  await page.goto('/admin/users');
  // 步骤3：创建用户 ...
});
```

## 数据清理（创建/修改/导入了数据就必须清）
用 `cleanup` fixture 的 LIFO 栈，在**确认数据创建成功后立即**注册清理：
```typescript
cleanup.add(async () => { /* 删除本次创建的数据 */ });
```
- 优先用 API 删除（`page.request.delete(...)`，快且不受选择器漂移影响）；仅当确无 API 删除端点时才用 UI 删除
- 清理函数里用 `isVisible().catch(() => false)` 做防御性检查
- 资源名加运行级唯一后缀（如 `` `测试_${Date.now()}` ``），断言锚定到"本次创建那一行"，不要全页 `getByText`
- 纯验证类用例（空提交报错、格式校验等）**不产生持久数据，不需要 cleanup**

## fixture 系统
脚本必须 `import { test, expect } from '../fixtures'`。fixture 只提供：
- **`page`**：Playwright Page（登录在 test body 里自己写）
- **`cleanup`**：LIFO 清理栈，`cleanup.add(async () => {...})`

## 常见修复对照
| 错误 | 修法 |
|---|---|
| `Fixture ... failed` / 测试主体执行前就报错 | **基础设施/环境问题，不是脚本 bug**。停止改脚本，在结论说明需检查环境配置（如账号密码、Base URL） |
| `browserType.launch: Executable doesn't exist` | Playwright 浏览器未装，**非脚本 bug**，说明需 `npx playwright install chromium` |
| `strict mode violation` | 加 `.first()` 或用父级缩小范围 |
| `Timeout waiting for locator` | 选择器错，按 testId→role→text 换 |
| `toBeVisible()` 超时 | 元素未出现，可能缺前置交互 |
| `toHaveText` 不匹配 | 改用 `toContainText()` 或更新期望值 |

## 重要
- 不要用 `Write` 工具写脚本，用 `submit_script`
- 不要把脚本作为代码块输出在回复里，用 `submit_script`
- 不调 `submit_script` 脚本就不会保存
