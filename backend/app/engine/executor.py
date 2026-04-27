"""
执行器 — 在沙箱中调用 pytest 执行单条用例。

仅包含同步函数，在 arq Worker 的线程中通过 anyio.to_thread.run_sync 调用。
"""
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from app.engine.command_builder import build_pytest_command, check_script_exists
from app.engine.result_parser import parse_junit_xml, parse_step_json

logger = logging.getLogger(__name__)


def execute_single_case(
    sandbox_dir: str,
    script_ref_file: str,
    script_ref_func: str | None = None,
    env_vars: dict[str, str] | None = None,
    timeout: int = 300,
) -> dict:
    """
    在沙箱中执行单条 pytest 用例。

    返回: {
        "status": "passed"|"failed"|"error"|"skipped",
        "duration_ms": int,
        "error_summary": str|None,
        "stdout": str,
        "steps": list[dict],
    }
    """
    # 1. 检查脚本存在
    if not check_script_exists(sandbox_dir, script_ref_file):
        return {
            "status": "skipped",
            "duration_ms": 0,
            "error_summary": f"脚本文件不存在: {script_ref_file}",
            "stdout": "",
            "steps": [],
        }

    # 2. 构建命令
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False, prefix="junit_") as f:
        junit_xml_path = f.name

    # 注入 HTTP 捕获插件
    plugin_src = Path(__file__).parent / "plugins" / "tea_capture.py"
    tea_plugins_dir = Path(sandbox_dir) / ".tea_plugins"
    tea_results_dir = Path(sandbox_dir) / ".tea_results"
    has_capture_plugin = plugin_src.exists()
    if has_capture_plugin:
        tea_plugins_dir.mkdir(parents=True, exist_ok=True)
        tea_results_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(plugin_src), str(tea_plugins_dir / "tea_capture.py"))

    # 注入平台 conftest.py（仅当沙箱中不存在时）
    conftest_src = Path(__file__).parent / "plugins" / "conftest_platform.py"
    sandbox_conftest = Path(sandbox_dir) / "tests" / "conftest.py"
    if conftest_src.exists() and not sandbox_conftest.exists():
        sandbox_conftest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(conftest_src), str(sandbox_conftest))

    cmd = build_pytest_command(
        sandbox_dir=sandbox_dir,
        script_ref_file=script_ref_file,
        script_ref_func=script_ref_func,
        junit_xml_path=junit_xml_path,
        capture_plugin=has_capture_plugin,
    )

    # 3. 构建环境变量
    run_env = os.environ.copy()
    if env_vars:
        run_env.update(env_vars)
    if has_capture_plugin:
        run_env["PYTHONPATH"] = str(tea_plugins_dir) + ":" + run_env.get("PYTHONPATH", "")
        run_env["TEA_CAPTURE_DIR"] = str(tea_results_dir)

    # 4. 执行
    start_time = time.time()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=sandbox_dir,
            env=run_env,
            timeout=timeout + 10,
        )
        stdout = result.stdout
        stderr = result.stderr
        returncode = result.returncode
    except subprocess.TimeoutExpired:
        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "status": "error",
            "duration_ms": duration_ms,
            "error_summary": f"执行超时（{timeout}s）",
            "stdout": "",
            "steps": [],
        }

    duration_ms = int((time.time() - start_time) * 1000)

    # 5. 解析 JUnit XML
    junit_results = parse_junit_xml(junit_xml_path)

    # 清理临时文件
    try:
        os.unlink(junit_xml_path)
    except OSError:
        pass

    # 6. 确定整体状态
    if not junit_results:
        status = "error" if returncode != 0 else "passed"
        error_summary = stderr[:2000] if returncode != 0 else None
    else:
        statuses = [r["status"] for r in junit_results]
        if "error" in statuses:
            status = "error"
        elif "failed" in statuses:
            status = "failed"
        elif all(s == "skipped" for s in statuses):
            status = "skipped"
        else:
            status = "passed"

        error_msgs = [r["message"] for r in junit_results if r["message"]]
        error_summary = "; ".join(error_msgs)[:2000] if error_msgs else None

    # 7. 解析步骤级 JSON（可选）
    steps = []
    if script_ref_func:
        step_json_path = str(Path(sandbox_dir) / ".tea_results" / f"{script_ref_func}.json")
        steps = parse_step_json(step_json_path)
        if not steps:
            step_json_path = str(Path(sandbox_dir) / f"{script_ref_func}.json")
            steps = parse_step_json(step_json_path)

    return {
        "status": status,
        "duration_ms": duration_ms,
        "error_summary": error_summary,
        "stdout": ((stdout or "") + ("\n--- STDERR ---\n" + stderr if stderr else ""))[:10000],
        "steps": steps,
    }
