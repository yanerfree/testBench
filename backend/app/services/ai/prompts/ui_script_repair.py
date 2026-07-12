"""Playwright 脚本修复 Prompt"""
from __future__ import annotations

REPAIR_SYSTEM_PROMPT = """你是一位资深 Playwright 调试工程师。用户的 UI 自动化脚本执行失败了，你需要分析错误原因并修复脚本。

## 选择器规则（必须遵守）
- **只用 get_by_role / get_by_label / get_by_text**
- **禁止 get_by_placeholder、禁止 CSS 选择器**
- 错误日志中 "Aria snapshot:" 后面的内容是页面真实结构，用那里的 role 和 name
- 例如 snapshot 有 `textbox "payment-api"` → 用 `page.get_by_role("textbox", name="payment-api")`

## 修复策略
1. **strict mode violation: resolved to N elements** → 用 exact=True、.first、或更具体的 role
2. **TimeoutError 找不到元素** → 从 Aria snapshot 找正确的元素名
3. **断言文本不匹配** → 用 to_contain_text 替代 to_have_text
4. **错误日志中的 "aka ..."** 是 Playwright 给的替代选择器，可以直接用

## 输出
- 修复后的完整 Python 文件（不是 diff）
- 不要 markdown 代码块包裹
- 保留 tea_step 标记"""


def get_repair_prompt(
    original_script: str,
    error_summary: str,
    stdout: str = "",
    history: list[dict] | None = None,
) -> str:
    parts = ["## 原始脚本\n```python", original_script, "```\n"]
    parts.append(f"## 本次错误\n{error_summary}\n")

    if stdout:
        aria_match = _extract_aria_snapshot(stdout)
        if aria_match:
            parts.append(f"## 页面 Aria Snapshot\n```\n{aria_match}\n```\n")
        parts.append(f"## 执行日志（最后 2000 字符）\n```\n{stdout[-2000:]}\n```\n")

    if history and len(history) > 0:
        parts.append("## 调试历史（之前尝试修复过但仍然失败的记录）")
        parts.append("**以下方法已经试过了，都失败了，不要重复同样的修复：**\n")
        for i, h in enumerate(history, 1):
            parts.append(f"### 第 {i} 次失败")
            parts.append(f"错误: {h['error'][:300]}")
            if h.get('stdout_tail'):
                parts.append(f"日志片段: {h['stdout_tail'][:200]}")
            parts.append("")

    parts.append("请分析失败原因（注意避免重复之前已失败的修复方式），输出修复后的完整 Python 文件。")
    return "\n".join(parts)


def _extract_aria_snapshot(stdout: str) -> str:
    """从 Playwright 错误日志中提取 Aria snapshot"""
    import re
    match = re.search(r"Aria snapshot:(.+?)(?:\n\n|\Z)", stdout, re.DOTALL)
    if match:
        return match.group(1).strip()[:3000]
    return ""
