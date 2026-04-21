"""构建 pytest 命令行参数（纯函数）。"""
from pathlib import Path


def build_pytest_command(
    sandbox_dir: str,
    script_ref_file: str,
    script_ref_func: str | None = None,
    junit_xml_path: str | None = None,
) -> list[str]:
    """
    构建 pytest 命令。

    返回: ["pytest", "tests/api/auth/test_login.py::test_func", "--junit-xml=...", ...]
    """
    test_target = str(Path(sandbox_dir) / script_ref_file)
    if script_ref_func:
        test_target += f"::{script_ref_func}"

    cmd = ["pytest", test_target, "--tb=short", "-q", "--no-header"]

    if junit_xml_path:
        cmd.append(f"--junit-xml={junit_xml_path}")

    return cmd


def check_script_exists(sandbox_dir: str, script_ref_file: str) -> bool:
    """检查脚本文件是否存在。"""
    return (Path(sandbox_dir) / script_ref_file).exists()
