# Playwright Test Script Output Specification

## File Naming

- Pattern: `{test-case-title-kebab-case}.spec.ts`
- Example: `login-with-valid-credentials.spec.ts`

## File Structure

```typescript
import { test, expect } from '../fixtures';

test.describe('{Test Case Title}', () => {
  test('{test case title}', async ({ page, cleanup }) => {
    // === Login (mandatory — verbatim copy from Phase 1 exploration) ===
    await page.goto('/');
    await page.getByPlaceholder('{the placeholder you actually saw}').fill(process.env.TEST_USER!);
    await page.getByPlaceholder('{the password placeholder}').fill(process.env.TEST_PASSWORD!);
    // copy the exact locator Phase 1 used — do NOT translate
    await page.getByText('登录', { exact: true }).click();
    await page.waitForURL(url => !url.href.match(/login|auth|signin/i), { timeout: 20000 });

    // Step 1: {step description}
    await page.goto('{relative_path}');
    await page.{action}('{selector}');
    await expect(page.{locator}).{assertion};

    // Step 2: {step description}
    // ...
  });
});
```

### Key Rules

- Import `test` and `expect` from `'../fixtures'` — **never** from `'@playwright/test'`
- The `cleanup` fixture is the only fixture you should use — register teardown callbacks via `cleanup.add(async () => { ... })`
- Login **MUST** be reproduced explicitly at the top of every test — do NOT rely on any auto-login fixture
- Do **NOT** hardcode the base URL — use relative paths with `page.goto('/some-path')`
- Do **NOT** use `test.beforeEach` for navigation — navigate directly in the test

## Authentication

Every test must reproduce the login sequence **verbatim** from Phase 1 exploration:

1. `await page.goto('/');` — base URL handles SSO redirect
2. Fill username field — copy the **exact** Playwright expression from Phase 1's `### Ran Playwright code` block (e.g. `await page.getByPlaceholder('请输入 用户名').fill(process.env.TEST_USER!);`)
3. Fill password field — same rule
4. Click the login button — copy the **exact** locator Phase 1 used. **If Phase 1 used `getByText('登录', { exact: true })`, your script MUST use `getByText`. Do NOT translate it into `getByRole('button', { name: '登录' })`** — Playwright Test's ARIA computation may not see the element as a button even if the snapshot YAML labels it `button`.
5. `await page.waitForURL(url => !url.href.match(/login|auth|signin/i), { timeout: 20000 });`

Credentials are injected via env vars `TEST_USER` and `TEST_PASSWORD`. Use `process.env.TEST_USER!` / `process.env.TEST_PASSWORD!` with non-null assertion — **never** add `|| 'admin'` / `|| 'admin123'` plaintext fallback.

## Selector Strategy (Priority Order)

**Rule #1: Copy the Playwright expression Phase 1 actually ran.** Phase 1 tool results contain a `### Ran Playwright code` block showing the exact Playwright code Playwright MCP executed successfully — copy it verbatim into your script. Do not "upgrade" the locator type (e.g. `getByText` → `getByRole`); the snapshot YAML's ARIA labels may differ from Playwright Test's strict ARIA computation.

**Rule #2: When Phase 1 has no `### Ran Playwright code` for an element you need** (e.g. you only saw it in a snapshot but never interacted with it), pick the most stable locator:

1. `page.getByTestId('...')` — data-testid attributes (most stable)
2. `page.getByText('...', { exact: true })` — visible text (preferred over getByRole because Playwright Test's ARIA tree may be stricter than the snapshot's)
3. `page.getByLabel('...')` — form labels
4. `page.getByPlaceholder('...')` — placeholder text (good for input fields)
5. `page.getByRole('...', { name: '...' })` — only when there's no Phase 1 evidence AND the element is unambiguously a standard ARIA role (button, link, heading, textbox, etc.)
6. `page.locator('css=...')` — CSS selector (last resort)

## Assertion Patterns

- Element visible: `await expect(locator).toBeVisible();`
- Text content: `await expect(locator).toHaveText('...');`
- Contains text: `await expect(locator).toContainText('...');`
- Input value: `await expect(locator).toHaveValue('...');`
- URL navigation: `await expect(page).toHaveURL(/pattern/);`
- Count: `await expect(locator).toHaveCount(N);`

## Action Patterns

- Click: `await page.getByRole('button', { name: '...' }).click();`
- Fill input: `await page.getByLabel('...').fill('value');`
- Fill by placeholder: `await page.getByPlaceholder('...').fill('value');`
- Select dropdown: `await page.getByLabel('...').selectOption('value');`
- Keyboard: `await page.keyboard.press('Enter');`

## Cleanup Pattern (MANDATORY)

**Every test that creates data MUST register cleanup.** If the test creates users, teams, projects, test cases, modules, or any other persistent entity, cleanup is required — not optional.

### Detection rule

If ANY test step performs a "创建" / "新建" / "Create" / "Add" / "Import" action, the generated script MUST include `cleanup.add(...)`.

### API cleanup (preferred)

```typescript
test('create and verify team', async ({ page, cleanup }) => {
  // ... login block (see template) ...
  const teamName = `测试团队_${Date.now()}`;
  // ... create team via UI ...
  await expect(page.getByText(teamName)).toBeVisible();

  cleanup.add(async () => {
    const resp = await page.request.get('/api/v1/teams?search=' + encodeURIComponent(teamName));
    const data = await resp.json();
    const team = data.data?.items?.find((t: any) => t.name === teamName);
    if (team) {
      await page.request.delete(`/api/v1/teams/${team.id}`);
    }
  });

  // ... remaining assertions
});
```

### UI cleanup (fallback)

```typescript
test('create and verify user', async ({ page, cleanup }) => {
  // ... login block (see template) ...
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

### Key rules

- Register cleanup **right after** data creation is confirmed (not at the end of the test)
- Use unique names with timestamps (`Date.now()`) or random suffixes to avoid collisions
- Wrap cleanup actions in `isVisible().catch(() => false)` guards to avoid cleanup failures masking test failures
- Prefer API deletion over UI deletion — it's faster and more reliable

## Fixture File Reference

When fixture files have been uploaded to the project or test case, they are automatically placed in `fixtures/files/` alongside the spec file before the test runs. Reference them with:

```typescript
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(__dirname, '../fixtures/files/', 'import-template.csv');
await page.setInputFiles('input[type="file"]', filePath);
```

**Rules:**
- Use `path.join(__dirname, '../fixtures/files/', filename)` — never hard-code an absolute path
- Do **NOT** use `fs.writeFileSync` to recreate a file that already exists as a fixture; just reference it directly
- Binary fixtures (Excel, PDF): pass directly to `setInputFiles` — no base64 decoding needed
- Text fixtures (CSV, JSON): can be read with `fs.readFileSync(filePath, 'utf-8')` if the content needs inspection

## File Upload Pattern

Tests that upload files to the system must generate the fixture file inline and clean it up via `cleanup.add`.

### Text-based files (CSV, JSON, TXT) — inline generation (preferred)

```typescript
import { test, expect } from '../fixtures';
import * as fs from 'fs';
import * as path from 'path';

test('批量导入资产', async ({ page, cleanup }) => {
  // ... login block (see template) ...

  // Generate fixture file next to the spec, auto-remove after test
  const csvPath = path.join(__dirname, `import-${Date.now()}.csv`);
  fs.writeFileSync(csvPath, [
    'asset_name,asset_type,ip_address',
    'test-server-001,server,192.168.1.1',
  ].join('\n'));
  cleanup.add(() => { try { fs.unlinkSync(csvPath); } catch {} });

  await page.goto('/assets');
  await page.getByRole('button', { name: '导入' }).click();
  await page.setInputFiles('input[type="file"]', csvPath);
  await page.getByRole('button', { name: '确认导入' }).click();

  await expect(page.getByText('导入成功')).toBeVisible();
});
```

### Binary files (Excel, PDF) — base64 inline

When the agent knows the required binary content, embed it as a base64 string and decode at runtime:

```typescript
const xlsxBase64 = 'UEsDBBQAAAAI...'; // embed actual base64 content
const buf = Buffer.from(xlsxBase64, 'base64');
const xlsxPath = path.join(__dirname, `import-${Date.now()}.xlsx`);
fs.writeFileSync(xlsxPath, buf);
cleanup.add(() => { try { fs.unlinkSync(xlsxPath); } catch {} });

await page.setInputFiles('input[type="file"]', xlsxPath);
```

### Key rules for file upload

- Always use `path.join(__dirname, ...)` so the path is relative to the spec file
- Always add a timestamp suffix to filenames to avoid collisions
- Always register cleanup with `cleanup.add` immediately after `writeFileSync`
- Use `page.setInputFiles(selector, filePath)` to trigger the upload — do not click the input manually

## File Download Pattern

Use `page.waitForDownload()` before the click that triggers the download.

### Verify text content (CSV, JSON, TXT)

```typescript
test('导出资产列表', async ({ page }) => {
  // ... login block (see template) ...
  await page.goto('/assets');

  const downloadPromise = page.waitForDownload();
  await page.getByRole('button', { name: '导出' }).click();
  const download = await downloadPromise;

  // Read content directly — no temp file needed
  const content = await download.readContent('utf-8');
  expect(content).toContain('asset_name');
});
```

### Verify binary content or filename

```typescript
test('导出资产 Excel', async ({ page, cleanup }) => {
  // ... login block (see template) ...
  await page.goto('/assets');

  const downloadPromise = page.waitForDownload();
  await page.getByRole('button', { name: '导出 Excel' }).click();
  const download = await downloadPromise;

  // Verify suggested filename
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

  // Save and verify size / magic bytes
  const savePath = path.join(__dirname, `download-${Date.now()}.xlsx`);
  await download.saveAs(savePath);
  cleanup.add(() => { try { fs.unlinkSync(savePath); } catch {} });

  const buf = fs.readFileSync(savePath);
  expect(buf.length).toBeGreaterThan(0);
  // Excel magic bytes: PK (zip-based)
  expect(buf[0]).toBe(0x50);
  expect(buf[1]).toBe(0x4b);
});
```

### Key rules for file download

- Always call `page.waitForDownload()` **before** the click, not after
- Use `download.readContent('utf-8')` for text files — no disk write needed
- Use `download.saveAs(path)` only when content length or binary validation is required; always clean up with `cleanup.add`
- Do NOT assert on the full file path — only `suggestedFilename()` and content

## Rules

- Never use `page.waitForTimeout()` — use `expect` with auto-waiting
- Never use `page.waitForSelector()` — use locators with auto-waiting
- Never hardcode absolute URLs — use relative paths
- Always reproduce login explicitly at the top of every test — do NOT use any auto-login fixture
- Keep each test independent — no shared state between tests
- Use descriptive step comments matching the original test case steps
- Mark uncertain selectors with `// TODO: verify selector`
- For file upload tests: always generate fixture files inline with `fs.writeFileSync` + `cleanup.add`
- For file download tests: always call `page.waitForDownload()` before the triggering click
