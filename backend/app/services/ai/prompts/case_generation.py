"""用例生成 Prompt 模板"""
from __future__ import annotations

from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "testforge" / "knowledge"


def _load_knowledge() -> str:
    sections = []
    for subdir in ("patterns", "techniques"):
        d = KNOWLEDGE_DIR / subdir
        if not d.exists():
            continue
        for f in sorted(d.glob("*.md")):
            sections.append(f"### {f.stem.replace('-', ' ').title()}\n{f.read_text(encoding='utf-8').strip()}")
    return "\n\n".join(sections)


SYSTEM_PROMPT = """你是一位资深 QA 测试工程师，擅长从接口信息和业务规则中设计全面的测试用例。

## 输出要求
- 严格输出 JSON 数组，每个元素是一个测试用例对象
- 不要输出任何 JSON 以外的文本（不要 markdown 代码块包裹）
- 每个用例包含以下字段：
  - "title": 用例标题（简洁明了）
  - "type": "api"
  - "priority": "P0" | "P1" | "P2" | "P3"（P0 最高）
  - "preconditions": 前置条件（字符串，可为空）
  - "steps": 测试步骤数组，每步 {"action": "操作描述", "expected": "预期结果"}
  - "expected_result": 总体预期结果
  - "module": 模块名
  - "submodule": 子模块名（可为 null）
  - "tags": 标签数组，如 ["正向", "CRUD"] 或 ["异常", "边界值"]

## 测试设计原则
- 正向场景：正常 CRUD 流程、主路径
- 异常场景：缺少必填字段、非法类型、超长/超短值、空值
- 边界值：数值/字符串长度边界、分页边界
- 权限场景：未登录、无权限、跨项目访问
- 业务规则场景：根据提供的业务规则逐条覆盖
- 生成 8-15 条用例，优先覆盖高风险场景

__KNOWLEDGE_PLACEHOLDER__"""


def get_system_prompt() -> str:
    knowledge = _load_knowledge()
    insertion = f"\n## 测试知识库\n{knowledge}" if knowledge else ""
    return SYSTEM_PROMPT.replace("__KNOWLEDGE_PLACEHOLDER__", insertion)


def get_user_prompt(interface_info: str, business_rules: list[str], module: str, submodule: str | None) -> str:
    rules_text = "\n".join(f"- {r}" for r in business_rules) if business_rules else "（无特殊业务规则）"
    sub = f"/{submodule}" if submodule else ""
    return f"""请为以下接口设计测试用例：

## 目标模块
{module}{sub}

## 接口信息
{interface_info}

## 业务规则
{rules_text}

请生成完整的测试用例 JSON 数组。"""
