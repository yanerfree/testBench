---
name: playwright-browser
description: >
  Browser automation skill for navigating web pages, interacting with elements,
  taking screenshots, and recording video. Use this skill when you need to drive
  a browser to test a web application's UI.
license: MIT
compatibility: Requires Playwright MCP server connection
allowed-tools: browser_navigate browser_click browser_type browser_fill browser_select_option browser_hover browser_press_key browser_scroll browser_snapshot browser_screenshot browser_evaluate
---

# Playwright Browser Automation

You have access to a Playwright MCP browser. Follow these instructions when performing browser automation tasks.

## Core Workflow

1. **Navigate** to the target URL using `browser_navigate`
2. **Snapshot** the page using `browser_snapshot` to get the accessibility tree with element refs
3. **Interact** with elements using their ref numbers from the snapshot
4. **Verify** page state after each interaction by taking a new snapshot
5. **Screenshot** at key moments using `browser_screenshot`

## Interaction Rules

- Always call `browser_snapshot` before interacting — never guess element refs
- Use `browser_click` with the ref from the snapshot, not CSS selectors
- After clicking a button that triggers navigation or state change, wait and re-snapshot
- **CRITICAL: For form inputs, use `browser_fill` (clears then types) rather than `browser_type` (appends).** Using `browser_type` will append text to existing content, causing wrong values.
- Use `browser_select_option` for dropdowns

### Sequential Form Filling (IMPORTANT)

When filling multiple form fields on the same page, **fill them ONE AT A TIME sequentially** — never in parallel. Parallel fills can cause race conditions where:
- Focus jumps between fields unpredictably
- Values get appended to wrong fields
- Form validation fires prematurely

```
// CORRECT — sequential
await fill(username)
await fill(password)
await click(submit)

// WRONG — parallel
Promise.all([fill(username), fill(password)])  // Race condition!
```

## Tool Context: browser_run_code vs browser_evaluate

These two tools run code in **different contexts** — using the wrong one causes errors:

| Tool | Execution Context | Globals Available | Use For |
|------|------------------|-------------------|---------|
| `browser_run_code` | **Node.js** (Playwright runner) | `page`, `expect`, NO `window`/`document` | Page interactions, assertions, Playwright API calls |
| `browser_evaluate` | **Browser page** (in-page JS) | `window`, `document`, `localStorage` | DOM inspection, reading page state, generating random data |

Common mistake: calling `window.crypto.randomUUID()` in `browser_run_code` → "window is not defined". Use `browser_evaluate` instead.

## Screenshot Strategy

- Take a screenshot after each **significant** action (page load, form submit, navigation)
- Name screenshots descriptively: `step-{N}-{action-description}.png`
- **Do NOT** take redundant screenshots — if nothing changed since the last screenshot, skip it
- Do NOT take both a snapshot and a screenshot after every minor action — one or the other is usually enough

## Video Recording

Video recording is **NOT used during browser exploration** — screenshots are sufficient for recording selectors and verifying page state.

Video is recorded automatically during **script verification** (verify_script runs with `video: 'on'`). Do NOT call `browser_start_video` / `browser_stop_video` / `browser_video_chapter` unless you have a specific reason outside of the standard test generation workflow.

## Error Handling

- If an element ref is not found, re-snapshot the page — the DOM may have changed
- If navigation fails, screenshot the current state and report the error
- Never retry more than 3 times for the same action
- If a step cannot be completed, mark it as failed and continue to the next step

## Exploration Round Limit

**最多 10 轮**（每轮 = 1 次 navigate/snapshot 组合）用于探索/复现目标功能。超过 10 轮仍未取到足够信息 → 停止探索，报告当前已知状态，不要无限循环。

## Login Procedure for Protected Applications

若导航到目标 URL 后被重定向至登录页，**按以下顺序**完成登录，不要反复 navigate 不填表单：

```
1. browser_snapshot → 查看登录表单结构，找账号/密码输入框的 ref 或 name
2. browser_fill → 账号字段（使用 prompt 中提供的凭据）
3. browser_fill → 密码字段
4. browser_click → 登录按钮
5. 等待 URL 跳转离开登录页（不再匹配 /login / /auth / /signin）
6. browser_snapshot → 确认已进入认证后页面，再继续任务
```

**字段定位优先级**（按稳定性从高到低）：
- `input[name="username"]`、`input[name="loginName"]`、`input[placeholder*="用户名"]`
- `input[placeholder*="账号"]`、`input[placeholder*="AD"]`
- 第一个非密码文本输入框

若登录后仍停留在登录页（凭据错误）→ 立即停止，不要循环重试，报告"凭据无效"。

## Selector Recording for Script Generation

When exploring the page for test script generation, pay extra attention to selector stability:
- After using `browser_snapshot`, note elements with `data-testid` attributes — these are the most stable selectors
- Record the accessible role and name of each element you interact with for use in `getByRole`
- Avoid selectors based on element position or CSS classes alone — these break easily
- If an element has no testid, prefer `getByRole('button', { name: '...', exact: true })` over `getByText`
