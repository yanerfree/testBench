---
name: ui-test-script-gen
description: >
  Generates reusable Playwright Test scripts (.spec.ts) from functional test case
  steps and expected results. Use this skill when converting manual test cases into
  automated UI test scripts.
license: MIT
compatibility: Requires playwright-browser skill and Playwright MCP connection
allowed-tools: browser_navigate browser_click browser_type browser_fill browser_select_option browser_hover browser_press_key browser_scroll browser_snapshot browser_screenshot browser_start_video browser_stop_video browser_video_chapter browser_evaluate submit_script verify_script get_api_setup run_api_setup run_api_teardown start_api_trace collect_api_trace
---

# UI Test Script Generation

You are generating a Playwright Test script from a functional test case. Follow these instructions precisely.

## Input Format

You will receive:
- **Test case title**: What the test validates
- **Test case steps**: A list of steps with descriptions and expected outcomes
- **Expected result**: Overall expected outcome
- **Base URL**: The application's entry point (used for browser exploration only, NOT hardcoded into scripts)
- **Preconditions** (optional): A list of preconditions, some may have a `setupRef` field

## ⚠️ HIGHEST-PRIORITY CONSTRAINT — Precondition with API Setup (setupRef)

**This is the #1 rule, before Scope Discipline, before the Three-Phase Workflow.** If you violate it, the script is broken regardless of how clean the rest looks.

Test case preconditions may contain a `setupRef` field that references an API Setup configuration stored in ThemisAI. When present, you MUST:

1. **In Phase 1 (browser exploration)**, **really call `run_api_setup`** to create the resource in the test environment BEFORE doing UI clicks. Record the returned `resource` (id / name / _token). All subsequent UI steps that pick the resource must use **the real value** (`resource.name`, `resource.id`) — **do NOT** assume a pre-existing "测试团队" / "测试 provider" / etc.
2. **At the end of Phase 1**, call `run_api_teardown(name, resource)` (LIFO order) to delete what you just created.
3. **In Phase 2 (script generation)**, inline the `setupCode` at the top of the test function, and register `teardownCode` via `cleanup.add(async () => { ... })`. The generated `.spec.ts` must be self-contained — when the script later runs standalone (e.g. CI), it must create + clean its own data.

**Do NOT** replace setupRef with UI clicks. **Do NOT** write `// 前置脚本中已创建` / `// already created` style skip comments. **Do NOT** assume the resource already exists.

### Which tool to use when

| Phase | Tool | Purpose |
|---|---|---|
| Phase 1 探索前 | `run_api_setup(name, params)` | 真实创建资源，agent 用真值做 UI 探索 |
| Phase 1 探索后 | `run_api_teardown(name, resource)` | 真实删除资源 |
| Phase 2 生成脚本 | (no tool — copy code) | 把 setupCode/teardownCode 内联到 spec.ts |
| Fallback | `get_api_setup(project_id, name)` | 任务提示词漏给 setupCode 时补查 |

### When the task prompt directly contains a `## 前置数据建设（强制）` section

That section lists `setupCode` and `teardownCode` already fetched from the API Setup table — **just copy them verbatim** into the test function in Phase 2. You do not need to call `get_api_setup`; the tool is only a fallback for when the prompt omits a ref.

### How to inline (mandatory shape for Phase 2)

```typescript
test('test title', async ({ authenticatedPage, cleanup }) => {
  const page = authenticatedPage;

  // === Precondition: <setupRef name> ===
  // (setupCode from API Setup, with params replaced by concrete values)
  const resp = await page.request.post('/api/v1/teams', {
    data: { name: `测试团队_${Date.now()}`, owner_id: 1 }
  });
  expect(resp.status()).toBe(201);
  const team = (await resp.json()).data;

  // Register teardown (LIFO — runs after other cleanups)
  cleanup.add(async () => {
    // (teardownCode from API Setup, with resource = the created object)
    await page.request.delete(`/api/v1/teams/${team.id}`);
  });

  // === UI Test Steps ===
  await page.goto('/some-path');
  // ...
});
```

### paramsSchema with `count`

If `paramsSchema` includes a `count` parameter and the precondition implies multiple resources (e.g., "创建 100 个团队"), call `run_api_setup` in a loop during Phase 1 discovery, and wrap the setupCode in a loop during Phase 2 generation. Register a bulk teardown:

```typescript
  // === Precondition: createTeam (count=100) ===
  const teams = [];
  for (let i = 0; i < 100; i++) {
    const resp = await page.request.post('/api/v1/teams', {
      data: { name: `测试团队_${Date.now()}_${i}`, owner_id: 1 }
    });
    expect(resp.status()).toBe(201);
    teams.push((await resp.json()).data);
  }
  cleanup.add(async () => {
    for (const t of teams.reverse()) {
      await page.request.delete(`/api/v1/teams/${t.id}`);
    }
  });
```

### Preconditions WITHOUT setupRef

Skip them during script generation — they are informational context only (e.g., "用户已登录" is handled by the `authenticatedPage` fixture).

## CRITICAL: Scope Discipline

**Only explore and test what the test case steps describe.** Do NOT:
- Test features not mentioned in the steps
- Verify implementation details beyond what expected results require
- Explore pages not part of the test flow
- Take detours to "understand the page better"

## Three-Phase Workflow (MUST FOLLOW)

### Phase 1: Browser Exploration (~60% of effort)

Goal: Walk through the test case steps in the real browser, recording selectors and verifying outcomes.

**Do NOT record video in this phase — screenshots only.**

0. **API Trace (MANDATORY — first tool call)** — Call `start_api_trace` as the very first action in Phase 1, before any browser interaction. Do NOT skip this step. The interceptor works at the Playwright protocol level and survives page navigations.
1. **Login** if required (see Login Procedure below)
2. **Execute each test step** sequentially:
   - Perform the action described in the step
   - Take ONE snapshot to record selectors and verify the result
   - Only screenshot at key moments (page loads, form submissions, final state)
3. **Collect API Trace (MANDATORY)** — Call `collect_api_trace` to save captured requests.
4. Done — move to Phase 2

**Do NOT call `browser_start_video` / `browser_stop_video` / `browser_video_chapter` during exploration.**

**Efficiency rules for Phase 1:**
- `browser_snapshot` output already contains page structure — do NOT also call `browser_run_code` to extract body text
- Do NOT call both `browser_snapshot` and `browser_take_screenshot` after every action — choose one
- Do NOT fill forms in parallel — fill fields **one at a time, sequentially**
- Use `browser_fill` (clears then types) for form inputs, NOT `browser_type` (appends)
- Use `browser_evaluate` for in-page JS (DOM access). Use `browser_run_code` for Playwright API calls. Do NOT use `browser_run_code` with `window` or `document`.

### Phase 2: Script Generation (~30% of effort)

Based on what you observed in Phase 1, generate a script following `script-spec.md`. Key rules:
- Import from `'../fixtures'`, **never** from `'@playwright/test'`
- Use `authenticatedPage` fixture — do NOT write login logic
- Use relative paths for `page.goto()` — do NOT hardcode absolute URLs
- Every step must have at least one assertion
- Use `await expect(locator).toBeVisible()` pattern, never `waitForTimeout`

#### External system selector rules (non-Aemeath targets)

When the target system is an external / third-party app (not Aemeath itself), the verify environment may start a **fresh session with a different UI language** than what you saw during Phase 1 exploration. Apply these rules:

1. **Button / menu text — always use dual-language regex**
   ```typescript
   // WRONG — breaks when verify session is in English
   page.getByRole('button', { name: '新建资产' })
   // CORRECT
   page.getByRole('button', { name: /新建资产|New Asset/i })
   ```
   Look up the English equivalent during Phase 1 (hover or inspect the element's aria-label / text).

2. **Sidebar navigation — never use `a[href="#/path"]`**
   External SPAs usually use JS routing without real `href` attributes. Navigate directly using the hash URL **discovered in Phase 1** (do NOT guess it):
   ```typescript
   // WRONG — href may not exist
   await page.locator('a[href="#/assets/manage"]').click();
   // CORRECT — direct hash navigation (use the ACTUAL hash you observed in Phase 1)
   await page.goto('/console/#/<actual-hash-from-phase1>');
   await page.waitForLoadState('networkidle');
   ```

3. **After every `page.goto()` to an external SPA**, verify the correct page loaded by waiting for a page-specific landmark element before proceeding. If the landmark does NOT appear, the hash URL is wrong — do NOT add a fallback; instead re-run Phase 1 to find the correct URL:
   ```typescript
   await page.goto('/console/#/<hash-from-phase1>');
   // Wait for a landmark unique to that page (button, heading, or table the test needs)
   await expect(page.getByRole('button', { name: /新建资产|New Asset/i })).toBeVisible({ timeout: 20000 });
   // If this times out → hash URL is wrong → redo Phase 1 exploration, do NOT add .ant-menu-* fallback
   ```

4. **PAM `/console/` sidebar — always use hash navigation, never menu clicks; never guess the hash URL**
   PAM's admin console (`/console/`) uses SPA routing. The `authenticatedPage` fixture expands the sidebar automatically, but only if the script does NOT trigger a full `/console/` page reload.

   **The hash URL MUST come from Phase 1 exploration — never guess it.** Common mistakes:
   - ❌ `'/console/#/asset/list'` — guessed, likely wrong
   - ✅ Use the exact URL that appeared in the browser address bar after clicking the menu item during Phase 1

   **Known PAM URL mappings** (discovered via real navigation, use these directly):
   | 页面 | Hash 路径 |
   |------|-----------|
   | 资产管理 | `/console/#/assets/manage` |

   ```typescript
   // WRONG — guessed hash URL + .ant-menu-* fallback
   await page.goto('/console/#/assets/manage');   // URL guessed, not from Phase 1
   if (!btnVisible) {
     await page.locator('.ant-menu-item').filter({ hasText: /资产管理/ }).click(); // .ant-menu-item doesn't exist in PAM
   }

   // CORRECT — hash URL from Phase 1, no fallback
   await page.goto('/console/#/<exact-hash-from-phase1>');  // e.g. /console/#/pas/assets
   await expect(page.getByRole('button', { name: /新建资产|New Asset/i })).toBeVisible({ timeout: 20000 });
   ```

   **CRITICAL**: Never write a `.ant-menu-*` fallback block. If the hash navigation fails (landmark not found), the ONLY fix is to redo Phase 1 and find the correct hash. A silent fallback that uses non-existent `.ant-menu-*` selectors will never work and hides the real bug (wrong hash URL).

   During **Phase 1 exploration**, after logging in to PAM, if the sidebar is icon-only, first click the expand button at the bottom of the left sidebar (`page.locator('.ant-layout-sider-trigger').click()`) before clicking any menu items. Then **copy the exact URL shown in the address bar** (e.g. `https://pam-test.paraview.cn/console/#/pas/assets`) and extract the hash part (`#/pas/assets`) to use in the generated script.

5. **PAM uses native HTML elements — do NOT use `.ant-*` CSS class selectors**
   PAM does **not** use Ant Design component wrappers (`<Table>`, `<Modal>`, `<Card>`, etc.), so the `.ant-table`, `.ant-modal-content`, `.ant-card`, `.ant-radio-button-wrapper`, `.ant-select`, `.ant-steps-item`, `.ant-form-item` CSS classes **do not exist in the DOM**. Use ARIA roles or semantic HTML selectors instead.

   ```typescript
   // WRONG — these classes don't exist in PAM
   page.locator('.ant-table').first()
   page.locator('.ant-modal-content')
   page.locator('.ant-card')
   page.locator('.ant-radio-button-wrapper').filter({ hasText: /RedHat/ })
   page.locator('.ant-select')
   page.locator('.ant-steps-item-active')

   // CORRECT — use ARIA roles / semantic selectors
   page.getByRole('table').first()
   page.getByRole('dialog')
   page.locator('div[class*="card"]').first()
   page.getByRole('radio', { name: /RedHat/i })
   page.getByRole('combobox')
   page.locator('[class*="step"][class*="active"], [aria-current="step"]').first()
   ```

   During **Phase 1 exploration** of PAM, always call `browser_snapshot` to inspect the actual DOM structure. If you don't see `.ant-*` classes in the snapshot output, use `page.getByRole()` selectors (table, dialog, button, radio, combobox, etc.) or `[class*="keyword"]` partial-class selectors instead of exact `.ant-*` names.

### Phase 3: Submit & Verify (~10% of effort)

1. Call `submit_script` with the full script content
2. Call `verify_script` to validate
3. If failed: read errors, fix, re-submit, re-verify (max 3 cycles)

## Fixture System

All generated scripts MUST use the project's fixture system:

- **`authenticatedPage`** — A Playwright `Page` already logged in via `globalSetup` + `storageState`. The browser state (cookies, localStorage) is restored from a previous UI login. No login needed in tests.
- **`cleanup`** — A teardown callback registry. Call `cleanup.add(async () => { ... })` for data cleanup.

### Import Rule

```typescript
// CORRECT — always use this
import { test, expect } from '../fixtures';

// WRONG — never use raw playwright import
import { test, expect } from '@playwright/test';
```

### Using authenticatedPage

```typescript
test('my test', async ({ authenticatedPage, cleanup }) => {
  const page = authenticatedPage;  // alias for convenience
  await page.goto('/some-path');   // relative path, never absolute URL
  // ... test steps
});
```

### URL Rules

- **Never hardcode** absolute URLs like `http://localhost:5173` or `http://192.168.x.x:3000`
- **Always use relative paths**: `page.goto('/test-cases')`, not `page.goto('http://...')`

### Cleanup Rule (MANDATORY)

**Every test that creates, modifies, or imports data MUST register cleanup.** This is not optional. If the test creates users, teams, projects, test cases, modules, or any other persistent resource, the generated script MUST clean it up.

#### How to detect data creation

During Phase 1 (browser exploration), watch for these signals:
- Clicking "创建" / "新建" / "Create" / "Add" / "Import" buttons
- Filling forms that submit new entities (users, teams, projects, etc.)
- API calls that POST/PUT new resources
- Any action whose result adds a new row/card/item to a list

#### Cleanup strategy (in priority order)

1. **API cleanup (MANDATORY — default approach)**: Use `page.request.delete()` or `page.request.post()` to call the backend API directly. API cleanup finishes in under 1 second, never timeouts, never fails due to selector drift.
2. **UI cleanup (last resort only)**: Only use if the resource has **no API DELETE endpoint at all**. UI cleanup is slow, fragile, and subject to selector changes.

**You must use API cleanup unless you can confirm the API endpoint does not exist.**

#### API cleanup 的前提（MANDATORY CHECK）

**Only use API cleanup if you have evidence from api_trace.** After calling `collect_api_trace`, check whether the trace contains HTTP requests for the resource you created (e.g. a POST to create a tag). If yes, you can infer the DELETE endpoint from that URL. If api_trace is empty or contains no relevant requests, **you MUST use UI cleanup instead** — do not guess API endpoints.

Guessing an API endpoint is worse than UI cleanup: UI cleanup failing only leaves leftover data; a wrong API call may hit an unintended endpoint or delete the wrong resource.

#### Auth for API cleanup — two patterns depending on the app under test

The app under test may use **JWT (localStorage)** or **cookie-based** session auth. Pick the right pattern:

**Pattern A — JWT / localStorage (e.g. ThemisAI itself)**

`page.request` does NOT automatically include the Bearer token. Capture it from localStorage after login:

```typescript
const platformBase = (process.env.PLATFORM_API_URL || '') + '/api/v1';
const authToken = await page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem('aemeath-auth') || '{}')?.state?.token ?? '';
  } catch { return ''; }
});
// use authToken in every page.request call:
// headers: { Authorization: `Bearer ${authToken}` }
```

**Pattern B — Cookie-based session (e.g. IAM, legacy systems)**

`page.request` does NOT forward cookies to a different origin. Use `page.evaluate(fetch(..., { credentials: 'include' }))` instead — it runs inside the browser and the browser sends session cookies automatically:

```typescript
// BASE_URL is the app under test — injected by the executor
const appBase = (process.env.BASE_URL || '').replace(/\/+$/, '');

// In cleanup.add:
const result = await page.evaluate(async (args) => {
  try {
    const res = await fetch(args.appBase + '/api/resource/' + args.id, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok ? 'deleted' : 'failed:' + res.status;
  } catch (e: any) { return 'error:' + e.message; }
}, { appBase, id: createdId });
```

**How to tell which pattern applies**: check api_trace for request headers. If you see `Authorization: Bearer ...` headers → Pattern A. If you see `Cookie: ...` headers (or no Authorization header at all) → Pattern B.

**Never use `PLATFORM_API_URL` as the base for the app under test's API** — `PLATFORM_API_URL` points to the ThemisAI platform backend, not the app being tested. Use `BASE_URL` for the app's own API.

#### Cleanup timing

Register `cleanup.add(...)` **immediately after** the data is confirmed created (e.g., after asserting the new item is visible). Do NOT defer cleanup registration to the end of the test — the cleanup fixture uses a LIFO stack, so earlier registrations run last.

#### Examples

```typescript
// API cleanup — REQUIRED default
test('create team', async ({ page, cleanup }) => {
  // === Login ===
  await page.goto('/');
  await page.getByPlaceholder('请输入 用户名').fill(process.env.TEST_USER!);
  await page.getByPlaceholder('请输入密码').fill(process.env.TEST_PASSWORD!);
  await page.getByText('登录', { exact: true }).click();
  await page.waitForURL(url => !url.href.match(/login|auth|signin/i), { timeout: 20000 });

  // Capture auth token for API calls
  const platformBase = (process.env.PLATFORM_API_URL || '') + '/api/v1';
  const authToken = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('aemeath-auth') || '{}')?.state?.token ?? '';
    } catch { return ''; }
  });


  const teamName = `测试团队_${Date.now()}`;
  // ... create team via UI ...
  await expect(page.getByText(teamName)).toBeVisible();

  // Register API cleanup immediately after confirming creation
  cleanup.add(async () => {
    // Search by name to get the ID
    const response = await page.request.get(
      `${platformBase}/teams?search=${encodeURIComponent(teamName)}`,
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
    if (response.ok()) {
      const body = await response.json();
      const team = (body.data?.items ?? body.data ?? []).find((t: any) => t.name === teamName);
      if (team?.id) {
        await page.request.delete(`${platformBase}/teams/${team.id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }
    }
  });
});

// UI cleanup — LAST RESORT only (no API endpoint available)
test('create user', async ({ page, cleanup }) => {
  // login (omitted; see Login Procedure)
  // ... create user via UI ...
  cleanup.add(async () => {
    await page.goto('/admin/users');
    const row = page.getByRole('row', { name: /testuser/ });
    if (await row.isVisible().catch(() => false)) {
      await row.getByRole('button', { name: /delete|删除/i }).click();
      const confirm = page.getByRole('button', { name: /confirm|确认/i }).first();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
      }
    }
  });
});
```

#### What happens if you skip cleanup

Leftover test data pollutes the test environment, causes flaky tests when names collide, and eventually breaks other test cases. **Always clean up.**

## Login Procedure (for Browser Exploration Only)

The `authenticatedPage` fixture handles login automatically during script **execution**. But during browser **exploration** (Phase 1), YOU must log in manually.

### Pre-configured Credentials

Use the credentials provided in the prompt (`登录账号` / `登录密码`). If not provided, default to `admin` / `admin123`.

**Exact names — do NOT invent variants**: use `TEST_USER` (not `TEST_USERNAME`, `TEST_USER_NAME`, or any other spelling). The executor only injects `TEST_USER` and `TEST_PASSWORD`; any other name resolves to `undefined` and crashes the script.

**Forbidden**: `process.env.TEST_USER || 'admin'`, `process.env.TEST_PASSWORD || 'admin123'`, or any literal credential as fallback — security-sensitive defaults must not leak into checked-in scripts.

### Login Recipe (follow exactly)

The login page layout varies between apps. **Always use `browser_snapshot` first** to discover the actual element refs and accessible names before interacting.

```
1. browser_navigate → {baseURL}（直接访问应用根路径，应用会自动重定向到登录页）
2. browser_snapshot → get element refs and accessible names
3. browser_fill → username field (use the ref/name from snapshot, NOT hardcoded selectors)
4. browser_fill → password field (use the ref/name from snapshot)
5. browser_click → login button (use the ref/name from snapshot)
6. Wait for URL to change away from /login
7. browser_snapshot → verify you're on the authenticated page
```

**IMPORTANT:** Steps 3-5 MUST be sequential. Do NOT fill username and password in parallel.

⚠️ **登录失败处理**：若登录后仍停留在登录页（凭据错误），立即停止探索，在诊断结论中注明凭据无效，不要循环重试。

### How `authenticatedPage` Fixture Works at Execution Time

The fixture uses a **two-step strategy**:

1. **Tries Aemeath API login** (`POST /api/v1/auth/login`) — works when the target app is an Aemeath instance
2. **Falls back to browser UI login** — if step 1 returns non-2xx, the fixture opens the app's homepage, waits for a login page redirect, and fills credentials via the browser

This means `authenticatedPage` works for both Aemeath-hosted apps and external systems (e.g., PAM, SSO). The generated script does **NOT** need login code in either case.

Example — if test case steps are:
1. 管理员登录平台
2. 进入用户管理页面
3. 创建新用户

Generated script starts at step 2:
```typescript
test('创建新用户', async ({ authenticatedPage, cleanup }) => {
  const page = authenticatedPage;
  // Step 2: 进入用户管理页面
  await page.goto('/admin/users');
  // Step 3: 创建新用户
  // ...
});
```

## Script Submit & Verify Workflow

### Step 1: Submit

Call `submit_script` with the full script content.

### Step 2: Verify

Call `verify_script` (no parameters).

### Step 3: Handle Result

- **VERIFICATION PASSED** → Done. Output a brief summary and stop.
- **VERIFICATION FAILED** → Read the error details, fix the script, re-submit, re-verify.
- Maximum 3 submit→verify cycles.

### IMPORTANT: Verify Environment Constraints

The verification system uses its own `global-setup.js`, `playwright.config.js`, and `fixtures/index.ts` — these files are **overwritten every time** `verify_script` runs. **Do NOT attempt to edit them** (via `edit_file`, `write_file`, or any other tool). If verification fails, fix the **test script itself**, not the infrastructure files.

### Common Fix Patterns

| Error Pattern | Fix |
|---|---|
| `Fixture login failed: 4xx` | **不是脚本 bug**，执行环境凭据问题。停止修脚本，在诊断结论中说明需检查项目环境配置的账号密码 |
| `browserType.launch: Executable doesn't exist` | **不是脚本 bug**，Playwright 浏览器未安装。停止修脚本，说明需在执行容器内运行 `npx playwright install chromium` |
| `strict mode violation` | Add `.first()` or scope with parent locator |
| `Timeout exceeded...waiting for locator` | Wrong selector — try testid → role → text |
| `expect(received).toBeVisible()` timeout | Element hidden — may need prior interaction |
| `expect(received).toHaveText(expected)` | Use `toContainText()` or update expected value |
| `element(s) not found` on button/action — page IS already loaded and user IS logged in | **语言不匹配**：验证环境会话语言可能是英文，而脚本是从中文 UI 录制的。**必须改用双语 regex**：`page.getByRole('button', { name: /新建资产\|New Asset/i })`。不要反复换中文选择器——语言问题换多少次都不会通过。 |
| `element(s) not found` on sidebar nav link (`a[href="#/..."]`) | 外部系统侧边栏通常是 JS 路由，没有 href 属性。**改用 hash 直接导航**，hash URL 必须来自 Phase 1 探索时观察到的真实地址栏 URL，不能猜。 |
| Sidebar collapsed — `.ant-menu-item` with Chinese text not found | PAM `/console/` 侧边栏默认折叠（icon-only）。fixture 会自动展开，但前提是脚本**不能**再做 `page.goto('/console/')` 全页重载。**改用 hash 导航**（hash 必须来自 Phase 1 真实观察，不能猜）。如仍需展开，先 `await page.locator('.ant-layout-sider-trigger').click({ force: true })` 再做操作。 |
| Hash navigation succeeded（无报错）但目标页内容（按钮/表格）找不到 | **hash URL 猜错了**，导航静默去了错误页面。**不要加 `.ant-menu-*` 降级代码**（`.ant-menu-item` 在 PAM 不存在，降级代码什么也不做只是掩盖问题）。唯一正确修法：**重新做 Phase 1 探索**，在 PAM 浏览器里实际点击菜单后读取地址栏真实 hash，把正确 hash 替换进脚本。 |
| `.ant-table` / `.ant-modal-content` / `.ant-card` / `.ant-radio-button-wrapper` etc. `element(s) not found` on PAM | PAM 使用原生 HTML 元素，没有 Ant Design 的 CSS wrapper class。**改用 ARIA role**：`.ant-table` → `page.getByRole('table').first()`；`.ant-modal-content` → `page.getByRole('dialog')`；`.ant-radio-button-wrapper` → `page.getByRole('radio', { name: /label/i })`；`.ant-select` → `page.getByRole('combobox')`。不要反复换 `.ant-*` 选择器——这些 class 根本不在 DOM 里。 |

### IMPORTANT

- Do NOT use the `Write` tool to write scripts — use `submit_script` instead
- Do NOT output scripts as code blocks in your response — use `submit_script` instead
- If you skip `submit_script`, the script will NOT be saved
