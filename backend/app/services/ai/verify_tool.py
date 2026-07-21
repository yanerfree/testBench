"""verify_script LangChain tool — 用 npx playwright test 验证 TypeScript 脚本。

照搬 ThemisAI verify_tool.py 的完整实现：
- 创建临时 Playwright 项目（tests/ + fixtures/ + playwright.config.js）
- 写入 authenticatedPage fixture shim
- 运行 npx playwright test
- 解析 report.json 错误
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil

from langchain_core.tools import StructuredTool

logger = logging.getLogger(__name__)

VERIFY_TIMEOUT = 150
MAX_VERIFY_RETRIES = 3

# node 路径统一由 ts_runner 解析（env GLOBAL_NODE_MODULES → npm root -g → 默认），
# 去掉原来写死的 /home/dreamer/.nvm/... 机器路径。保留 _link_node_modules 名以兼容 scripts.py 引用。
from app.engine.ts_runner import link_node_modules as _link_node_modules  # noqa: E402
from app.engine.ts_runner import resolve_node_path  # noqa: E402

GLOBAL_SETUP = """\
module.exports = async function globalSetup() {
  // Auth is handled per-test inline (login in test body).
};
"""

FIXTURE_SHIM = """\
import { test as base, expect, type Page } from '@playwright/test';

type CleanupFn = () => Promise<void> | void;
type Cleanup = { add: (fn: CleanupFn) => void };

export const test = base.extend<{ cleanup: Cleanup }>({
  cleanup: async ({}, use, testInfo) => {
    const stack: CleanupFn[] = [];
    await use({ add(fn) { stack.push(fn); } });
    testInfo.setTimeout(testInfo.timeout + 60000);
    while (stack.length > 0) {
      const fn = stack.pop()!;
      try { await fn(); } catch (e) { console.error('cleanup error:', e); }
    }
  },
});

export { expect };
"""


async def _run_playwright_verify(
    script_content: str, base_url: str, artifacts_dir: str,
    test_user: str = "", test_password: str = "",
) -> str:
    verify_dir = os.path.join(artifacts_dir, "verify")
    os.makedirs(verify_dir, exist_ok=True)

    # symlink node_modules → 全局，让 Playwright 能解析 @playwright/test
    _link_node_modules(verify_dir)

    tests_dir = os.path.join(verify_dir, "tests")
    os.makedirs(tests_dir, exist_ok=True)

    fixtures_dir = os.path.join(verify_dir, "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)
    with open(os.path.join(fixtures_dir, "index.ts"), "w") as f:
        f.write(FIXTURE_SHIM)

    with open(os.path.join(verify_dir, "global-setup.js"), "w") as f:
        f.write(GLOBAL_SETUP)

    with open(os.path.join(tests_dir, "test.spec.ts"), "w") as f:
        f.write(script_content)

    config_content = f"""module.exports = {{
  testDir: './tests',
  timeout: 120000,
  retries: 0,
  use: {{
    baseURL: '{base_url}',
    headless: true,
    screenshot: 'on',
    locale: 'zh-CN',
    contextOptions: {{ recordHar: {{ path: './api-trace.har', content: 'embed' }} }},
  }},
  reporter: [['json', {{ outputFile: 'report.json' }}]],
  outputDir: './test-results',
}};
"""
    with open(os.path.join(verify_dir, "playwright.config.js"), "w") as f:
        f.write(config_content)

    try:
        proc = await asyncio.create_subprocess_exec(
            "npx", "playwright", "test",
            f"--config={os.path.join(verify_dir, 'playwright.config.js')}",
            cwd=verify_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={
                **os.environ,
                "CI": "1",
                "NODE_PATH": resolve_node_path(),
                "BASE_URL": base_url,
                "TEST_USER": test_user,
                "TEST_PASSWORD": test_password,
            },
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=VERIFY_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return "VERIFICATION TIMEOUT: 脚本执行超过 150 秒。"

        if proc.returncode == 0:
            return "VERIFICATION PASSED: 所有测试通过。脚本已就绪。"

        report_path = os.path.join(verify_dir, "report.json")
        error_details = _parse_errors_from_report(report_path)

        if not error_details:
            combined = (stderr or b"").decode(errors="replace") + "\n" + (stdout or b"").decode(errors="replace")
            error_details = combined.strip()[-2000:]

        return (
            f"VERIFICATION FAILED (exit code {proc.returncode}):\n\n{error_details}\n\n"
            f"请根据错误信息修复脚本，然后调用 submit_script 重新提交，再调用 verify_script 验证。"
        )

    except FileNotFoundError:
        return "VERIFICATION ERROR: npx 或 playwright 未找到。"
    except Exception as exc:
        return f"VERIFICATION ERROR: {type(exc).__name__}: {str(exc)[:500]}"


def _parse_errors_from_report(report_path: str) -> str:
    if not os.path.isfile(report_path):
        return ""
    try:
        with open(report_path) as f:
            raw = json.load(f)
        errors: list[dict] = []
        _collect_errors(raw.get("suites", []), errors)
        if not errors:
            return ""
        lines = []
        for err in errors[:5]:
            lines.append(f"Test: {err['test']}")
            lines.append(f"Error: {err['message']}")
            if err.get("snippet"):
                lines.append(f"Code: {err['snippet']}")
            lines.append("")
        return "\n".join(lines)
    except Exception:
        return ""


def _collect_errors(suites: list, out: list) -> None:
    for suite in suites:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                for result in test.get("results", []):
                    if result.get("status") != "passed":
                        for error in result.get("errors", []):
                            out.append({
                                "test": spec.get("title", "unknown"),
                                "message": error.get("message", "")[:500],
                                "snippet": error.get("snippet", "")[:300],
                            })
        _collect_errors(suite.get("suites", []), out)


def create_verify_tool(
    base_url: str, artifacts_dir: str, shared_state: dict,
    test_user: str = "", test_password: str = "",
) -> StructuredTool:
    async def _verify() -> str:
        script_content = shared_state.get("script_content", "")
        if not script_content.strip():
            return (
                "VERIFICATION ERROR: 没有已提交的脚本。"
                "请先调用 submit_script 提交脚本，再调用 verify_script。"
            )
        result = await _run_playwright_verify(
            script_content, base_url, artifacts_dir,
            test_user=test_user, test_password=test_password,
        )
        version = shared_state.get("version", 0)
        if "VERIFICATION FAILED" in result and version >= MAX_VERIFY_RETRIES:
            stop_idx = result.find("\n\n请根据错误信息修复脚本")
            if stop_idx != -1:
                result = result[:stop_idx]
            result += (
                f"\n\n⚠️ 已达到最大验证次数（{version} 次）。"
                "不要再次调用 submit_script 或 verify_script。"
                "当前版本作为最终提交，直接结束生成流程。"
            )
        return result

    return StructuredTool.from_function(
        coroutine=_verify,
        name="verify_script",
        description=(
            "验证已提交的 Playwright Test 脚本。"
            "无需传参，自动读取最近一次 submit_script 提交的脚本并执行。"
            "返回 VERIFICATION PASSED 或 VERIFICATION FAILED 及错误详情。"
        ),
    )
