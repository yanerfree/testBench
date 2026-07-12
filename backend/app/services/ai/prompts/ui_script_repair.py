"""Playwright 脚本修复 Prompt"""
from __future__ import annotations

REPAIR_SYSTEM_PROMPT = """你是一位资深 Playwright 调试工程师。用户的 UI 自动化脚本执行失败了，你需要分析错误原因并修复脚本。

## 修复原则
1. 只修改导致失败的部分，不重写整个脚本
2. 常见失败原因和修复方式：
   - **strict mode violation: resolved to N elements** → 选择器匹配了多个元素，需要更精确：
     * 用 .first / .nth(0) 取第一个
     * 用 exact=True 精确匹配文字
     * 用更具体的选择器（加父级限定、用 get_by_role 代替 CSS）
     * 错误日志中的 "aka get_by_text(...)" 提示了每个元素的文字，用最短唯一文字定位
   - **TimeoutError 找不到元素** → 换定位方式（get_by_text → get_by_role → CSS），或元素文字和代码不一致
   - **登录失败** → 检查登录表单的输入框 placeholder/label 是否匹配
   - **页面没加载完** → 加 page.wait_for_load_state("networkidle")
   - **断言文本不匹配** → 用 to_contain_text 替代 to_have_text

3. 错误日志中的 "aka ..." 是 Playwright 给出的替代选择器建议，直接用

## 输出要求
- 输出修复后的完整 Python 文件（不是 diff）
- 不要 markdown 代码块包裹
- 保留原有的 tea_step 标记和 import"""


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
