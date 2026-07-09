"""需求质量检测 — 软门禁（ft S2.4 / FR5）

三维检测（逻辑矛盾/边界缺失/歧义描述），健康分由代码加权计算。
LLM 只出问题清单不打分（不信任 LLM 算术 — themisai 实战教训）。
低于阈值仅提示用户确认，**无任何状态机阻断**。
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.scenario_gen.llm_structured import llm_structured
from app.services.scenario_gen.settings import get_settings


class QualityIssue(BaseModel):
    category: str = Field(description="逻辑矛盾 / 边界缺失 / 歧义描述")
    severity: str = Field(description="critical / major / minor")
    quote: str = Field(default="", description="相关原文片段")
    description: str = Field(description="问题描述")
    suggestion: str = Field(default="", description="修改建议")


class QualityCheckResult(BaseModel):
    issues: list[QualityIssue]


SEVERITY_WEIGHTS = {"critical": 15, "major": 8, "minor": 3}

HEALTH_CHECK_SYSTEM_PROMPT = """你是一位需求质量审查专家。审查用户提供的需求文档，识别以下三类问题：

1. **逻辑矛盾**：文档内不同部分对同一事项描述相互矛盾
2. **边界缺失**：缺少对边界条件、异常情况、极端值的定义
3. **歧义描述**：模糊的表述可能导致不同人有不同理解

对每个问题输出：
- category: "逻辑矛盾" / "边界缺失" / "歧义描述"
- severity: "critical"（会导致实现方向错误）/ "major"（会导致部分功能遗漏）/ "minor"（可能引起细节不一致）
- quote: 相关原文片段（必须是文档原文的精确子串）
- description: 问题描述（一句话）
- suggestion: 修改建议

**不要自行打分。只输出问题清单，分数由系统计算。**
如果文档质量良好没有问题，输出空数组。

输出严格 JSON 格式：{"issues": [...]}"""


def compute_health_score(issues: list[QualityIssue]) -> int:
    """代码从问题清单加权计算健康分（基础 100，每个问题按严重度扣分）。"""
    score = 100
    for issue in issues:
        score -= SEVERITY_WEIGHTS.get(issue.severity, 3)
    return max(0, score)


async def check_requirement_quality(
    config,
    doc_content: str,
    session: AsyncSession | None = None,
    project_id: uuid.UUID | None = None,
) -> dict:
    """执行需求质量检测，返回结构化结果（不做阻断决策）。

    返回：
        {
            "score": int,        # 健康分 0-100
            "issues": [...]      # QualityIssue 列表
            "below_threshold": bool  # 是否低于阈值（由调用方决定如何处理）
        }
    """
    cfg = get_settings()
    messages = [
        {"role": "system", "content": HEALTH_CHECK_SYSTEM_PROMPT},
        {"role": "user", "content": doc_content[:cfg.chunk_trigger_chars * 2]},
    ]

    result = await llm_structured(
        config, messages, QualityCheckResult,
        session=session, project_id=project_id, skill_name="scenario-health-check",
    )

    score = compute_health_score(result.issues)
    return {
        "score": score,
        "issues": [i.model_dump() for i in result.issues],
        "below_threshold": score < cfg.health_score_threshold,
    }
