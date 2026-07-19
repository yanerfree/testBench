"""verify_tool — 用 pytest-playwright 验证生成的 Python 脚本。

在临时沙箱中写入脚本 + conftest → 运行 pytest → 解析 JUnit 报告。
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

logger = logging.getLogger(__name__)

VERIFY_TIMEOUT = 150
MAX_VERIFY_RETRIES = 3


async def verify_script(
    script_content: str,
    base_url: str,
    env_vars: dict[str, str] | None = None,
) -> str:
    """验证 Python pytest-playwright 脚本。返回 VERIFICATION PASSED 或 VERIFICATION FAILED + 错误。"""
    if not script_content.strip():
        return "VERIFICATION ERROR: 脚本内容为空。"

    ev = env_vars or {}
    ev.setdefault("BASE_URL", base_url)
    sandbox = tempfile.mkdtemp(prefix="tb_verify_")
    try:
        return await _run_in_sandbox(script_content, sandbox, ev)
    finally:
        shutil.rmtree(sandbox, ignore_errors=True)


async def _run_in_sandbox(script_content: str, sandbox: str, env_vars: dict[str, str]) -> str:
    script_path = Path(sandbox) / "test_verify.py"
    script_path.write_text(script_content, encoding="utf-8")

    from app.engine.pw_conftest import write_playwright_conftest
    write_playwright_conftest(sandbox, env_vars)

    _write_tea_step_stub(sandbox)
    _write_pytest_ini(sandbox, env_vars.get("BASE_URL", ""))

    junit_path = os.path.join(sandbox, "report.xml")
    import sys
    cmd = [
        sys.executable, "-m", "pytest",
        str(script_path),
        f"--junitxml={junit_path}",
        "--tb=short",
        "-q",
    ]

    run_env = {**os.environ, **env_vars}

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=sandbox,
            env=run_env,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=VERIFY_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return "VERIFICATION TIMEOUT: 脚本执行超过 150 秒。"

        if proc.returncode == 0:
            return "VERIFICATION PASSED: 所有测试通过。脚本已就绪。"

        error_details = _parse_junit_errors(junit_path)
        if not error_details:
            combined = (stderr or b"").decode(errors="replace") + "\n" + (stdout or b"").decode(errors="replace")
            error_details = combined.strip()[-2000:]

        return (
            f"VERIFICATION FAILED (exit code {proc.returncode}):\n\n{error_details}\n\n"
            f"请根据错误信息修复脚本，然后重新调用 submit_script 提交，再调用 verify_script 验证。"
        )
    except FileNotFoundError:
        return "VERIFICATION ERROR: pytest 未找到。"
    except Exception as exc:
        return f"VERIFICATION ERROR: {type(exc).__name__}: {str(exc)[:500]}"


def _parse_junit_errors(junit_path: str) -> str:
    if not os.path.isfile(junit_path):
        return ""
    try:
        tree = ET.parse(junit_path)
        root = tree.getroot()
        errors = []
        for tc in root.iter("testcase"):
            for child in tc:
                if child.tag in ("failure", "error"):
                    msg = child.get("message", "")[:500]
                    text = (child.text or "")[:500]
                    errors.append(f"Test: {tc.get('name', 'unknown')}\nError: {msg}\n{text}")
        return "\n\n".join(errors[:5])
    except Exception:
        return ""


def _write_tea_step_stub(sandbox: str) -> None:
    """写入 tea_step 桩模块，让脚本能 import 但不依赖完整插件。"""
    stub = Path(sandbox) / "tea_step.py"
    if not stub.exists():
        stub.write_text(
            "from contextlib import contextmanager\n"
            "@contextmanager\n"
            "def tea_step(name, phase='action'):\n"
            "    yield\n",
            encoding="utf-8",
        )


def _write_pytest_ini(sandbox: str, base_url: str) -> None:
    """写入 pytest.ini 配置 base_url（让 page.goto('/path') 相对路径生效）。"""
    ini = Path(sandbox) / "pytest.ini"
    ini.write_text(
        "[pytest]\n"
        f"base_url = {base_url}\n",
        encoding="utf-8",
    )
