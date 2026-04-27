"""测试脚本扫描器 — 解析 tests/api/ 和 tests/e2e/ 下的 test_*.py，生成用例数据。

当项目没有 tea-cases.json 时，作为同步用例的 fallback。
输出格式兼容 import_service.import_cases() 的输入。
"""
import ast
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

SCAN_DIRS = ["tests"]

TYPE_MAP = {
    "api": "api",
    "e2e": "e2e",
    "atdd": "api",
    "integration": "api",
}


def _humanize(name: str) -> str:
    """test_admin_can_create_user → admin can create user"""
    s = name.removeprefix("test_").removeprefix("Test")
    s = re.sub(r"([A-Z])", r" \1", s)
    return s.replace("_", " ").strip()


def _extract_docstring(node: ast.AST) -> str | None:
    if (node.body
        and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, (ast.Constant, ast.Str))):
        val = node.body[0].value
        text = val.value if isinstance(val, ast.Constant) else val.s
        if isinstance(text, str):
            return text.strip().split("\n")[0][:200]
    return None


def _parse_file(file_path: Path, repo_root: Path) -> list[dict]:
    """解析单个 test_*.py 文件，提取用例数据。"""
    cases = []
    try:
        source = file_path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(file_path))
    except (SyntaxError, UnicodeDecodeError):
        logger.warning("Failed to parse %s", file_path)
        return cases

    rel_path = file_path.relative_to(repo_root)
    parts = rel_path.parts  # ('tests', 'api', 'auth', 'test_login.py')

    if len(parts) < 3:
        return cases

    test_type = TYPE_MAP.get(parts[1], "api")
    module = parts[1]
    submodule = parts[2] if len(parts) > 3 else None
    script_file = str(rel_path)

    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            class_name = node.name
            class_doc = _extract_docstring(node)

            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name.startswith("test_"):
                    func_name = item.name
                    func_doc = _extract_docstring(item)
                    title = func_doc or class_doc or _humanize(func_name)

                    tea_id_parts = [module]
                    if submodule:
                        tea_id_parts.append(submodule)
                    tea_id_parts.append(func_name)
                    tea_id = "_".join(tea_id_parts)

                    cases.append({
                        "tea_id": tea_id,
                        "title": title,
                        "type": test_type,
                        "module": module,
                        "submodule": submodule,
                        "priority": "P2",
                        "script_ref": {
                            "file": script_file,
                            "func": func_name,
                            "class": class_name,
                        },
                    })

        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
            func_name = node.name
            func_doc = _extract_docstring(node)
            title = func_doc or _humanize(func_name)

            tea_id_parts = [module]
            if submodule:
                tea_id_parts.append(submodule)
            tea_id_parts.append(func_name)
            tea_id = "_".join(tea_id_parts)

            cases.append({
                "tea_id": tea_id,
                "title": title,
                "type": test_type,
                "module": module,
                "submodule": submodule,
                "priority": "P2",
                "script_ref": {
                    "file": script_file,
                    "func": func_name,
                },
            })

    return cases


def scan_test_scripts(repo_root: str | Path) -> list[dict]:
    """扫描 tests/api/ 和 tests/e2e/ 目录下所有 test_*.py，返回用例列表。"""
    repo_root = Path(repo_root)
    all_cases = []

    for scan_dir in SCAN_DIRS:
        target = repo_root / scan_dir
        if not target.exists():
            continue
        for py_file in sorted(target.rglob("test_*.py")):
            if py_file.name == "conftest.py" or py_file.name.startswith("__"):
                continue
            cases = _parse_file(py_file, repo_root)
            all_cases.extend(cases)

    logger.info("Scanned %d test cases from %s", len(all_cases), [str(repo_root / d) for d in SCAN_DIRS])
    return all_cases
