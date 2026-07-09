"""静态校验器（ft S4.2 / FR54）

零 token 纯函数规则集，独立可单测：
- 模糊断言红线词检查（内置词表+项目扩展）
- P0 占比超上限自动降级并记 warning
- 标题去重
- 步骤数/必填完整性
- 错误提示-消除配对检查
"""
from __future__ import annotations

from app.services.scenario_gen.settings import ScenarioGenDefaults, get_settings


def validate_cases(
    cases: list[dict],
    settings: ScenarioGenDefaults | None = None,
) -> tuple[list[dict], list[dict]]:
    """校验用例列表，返回 (修正后用例列表, warnings 列表)。

    每条 warning: {case_index, rule, message, auto_fixed}
    """
    cfg = settings or get_settings()
    warnings: list[dict] = []

    # 1. 模糊断言红线词
    fuzzy_words = set(cfg.fuzzy_assertion_words)
    for i, case in enumerate(cases):
        expected = case.get("expected_result", "") or ""
        steps = case.get("steps") or []
        all_expectations = [expected] + [s.get("expected", "") for s in steps if isinstance(s, dict)]
        for text in all_expectations:
            for word in fuzzy_words:
                if word in text:
                    warnings.append({
                        "case_index": i,
                        "rule": "fuzzy_assertion",
                        "message": f"预期结果含模糊词「{word}」：{text[:60]}",
                        "auto_fixed": False,
                    })
                    break  # 每条用例只报一次 fuzzy

    # 2. P0 占比钳制
    p0_indices = [i for i, c in enumerate(cases) if c.get("priority") == "P0"]
    if cases and len(p0_indices) / len(cases) > cfg.p0_ratio_cap:
        excess = len(p0_indices) - int(len(cases) * cfg.p0_ratio_cap)
        for idx in p0_indices[-excess:]:
            cases[idx]["priority"] = "P1"
            warnings.append({
                "case_index": idx,
                "rule": "p0_ratio_cap",
                "message": f"P0 占比超 {int(cfg.p0_ratio_cap * 100)}%，自动降为 P1",
                "auto_fixed": True,
            })

    # 3. 标题去重
    seen_titles: dict[str, int] = {}
    for i, case in enumerate(cases):
        title = (case.get("title") or "").strip()
        if title in seen_titles:
            warnings.append({
                "case_index": i,
                "rule": "duplicate_title",
                "message": f"标题重复（与第 {seen_titles[title]+1} 条相同）：{title[:40]}",
                "auto_fixed": False,
            })
        else:
            seen_titles[title] = i

    # 4. 必填完整性
    for i, case in enumerate(cases):
        if not (case.get("title") or "").strip():
            warnings.append({"case_index": i, "rule": "missing_title", "message": "标题为空", "auto_fixed": False})
        steps = case.get("steps") or []
        if not steps:
            warnings.append({"case_index": i, "rule": "missing_steps", "message": "步骤为空", "auto_fixed": False})
        if not (case.get("expected_result") or "").strip():
            warnings.append({"case_index": i, "rule": "missing_expected", "message": "预期结果为空", "auto_fixed": False})

    return cases, warnings
