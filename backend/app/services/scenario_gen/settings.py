"""功能场景测试模块 — 阈值配置读取链（ft-1-2）

PRD 阈值默认值表 10 项参数统一收口于此。
读取链：项目级覆盖（generation_tasks.settings 或未来独立表）→ 系统默认常量。
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ScenarioGenDefaults:
    """系统级出厂默认值——与 PRD 阈值默认值表逐项对齐"""

    health_score_threshold: int = 70
    """需求健康分提示阈值：低于此值触发确认提示（FR5）"""

    chunk_trigger_chars: int = 16_000
    """超长文档判定：需求材料超过此字符数触发分块（FR6/FR51）"""

    chunk_size_chars: int = 16_000
    """分块大小（字符）"""

    input_max_chars: int = 200_000
    """单次任务需求材料上限（FR51）"""

    p0_ratio_cap: float = 0.40
    """P0 占比上限：超过此比例时超额 P0 自动降为 P1（FR54）"""

    fuzzy_assertion_words: list[str] = field(default_factory=lambda: [
        "操作成功", "显示正常", "无报错", "符合预期", "正确显示", "成功返回", "正常运行",
    ])
    """模糊断言红线词表——内置基础词表，项目级可增删（FR54）"""

    self_review_threshold: int = 75
    """AI 自评通过阈值：低于此分数回炉重生成（FR56）"""

    self_review_max_rounds: int = 3
    """AI 自评回炉上限轮次（FR56）"""

    structured_output_max_retry: int = 2
    """结构化输出校验失败重试上限（FR53）"""

    reject_reason_inject_count: int = 5
    """拒绝理由注入条数：取最近 N 条注入 prompt（FR26），可配 1-20"""

    dedup_title_threshold: float = 0.70
    """去重判定：标题相似度 ≥ 此值判疑似重复（FR18）"""

    dedup_step_overlap: float = 0.50
    """去重复核：步骤关键动作重叠 ≥ 此比例才确认跳过（FR18）"""

    case_limit_per_task: int = 200
    """单任务用例数上限（FR38）"""


# 全局单例——项目级覆盖在 get_settings() 中合并
_DEFAULTS = ScenarioGenDefaults()


def get_settings(project_overrides: dict | None = None) -> ScenarioGenDefaults:
    """读取阈值配置。

    project_overrides 来自 GenerationTask.settings 或未来的项目级配置表。
    只覆盖提供的键，其余用系统默认。

    用法：
        settings = get_settings(task.settings)
        if score < settings.health_score_threshold: ...
    """
    if not project_overrides:
        return _DEFAULTS

    overrides = {}
    for key in ScenarioGenDefaults.__dataclass_fields__:
        if key in project_overrides:
            val = project_overrides[key]
            default_val = getattr(_DEFAULTS, key)
            if isinstance(default_val, list) and isinstance(val, dict):
                # 列表型支持 {add: [...], remove: [...]} 增量操作
                base = list(default_val)
                for item in val.get("add", []):
                    if item not in base:
                        base.append(item)
                for item in val.get("remove", []):
                    if item in base:
                        base.remove(item)
                overrides[key] = base
            else:
                overrides[key] = type(default_val)(val) if not isinstance(val, type(default_val)) else val

    if not overrides:
        return _DEFAULTS

    return ScenarioGenDefaults(**{**{k: getattr(_DEFAULTS, k) for k in ScenarioGenDefaults.__dataclass_fields__}, **overrides})
