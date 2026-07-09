"""AI 自评回炉（ft S4.3 / FR56 / FR23 / ADR-5）

四维加权自评（完整性30/准确性25/有效性25/可执行性20），
低于阈值（默认75分）回炉重生成（代码强制≤3轮），
评分合成（静态50% + 自评50%）写 quality_score。
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.services.scenario_gen.llm_structured import llm_structured
from app.services.scenario_gen.settings import get_settings


class SelfReviewResult(BaseModel):
    completeness: int = Field(ge=0, le=100, description="完整性 0-100")
    accuracy: int = Field(ge=0, le=100, description="准确性 0-100")
    validity: int = Field(ge=0, le=100, description="有效性 0-100")
    executability: int = Field(ge=0, le=100, description="可执行性 0-100")
    issues: list[str] = Field(default_factory=list, description="发现的问题清单")
    suggestions: list[str] = Field(default_factory=list, description="改进建议")


SELF_REVIEW_PROMPT = """你是一位用例质量评审专家。对提供的测试用例进行四维度评分。

评分维度与权重：
1. **completeness（完整性 30%）**：功能点是否全覆盖、正向+负向是否齐全、边界值是否考虑
2. **accuracy（准确性 25%）**：预期结果是否正确、测试数据是否合理、不含模糊词（操作成功/显示正常等）
3. **validity（有效性 25%）**：用例是否有实际测试价值、是否重复、优先级是否合理
4. **executability（可执行性 20%）**：步骤是否可执行、数据是否具体、预期是否可验证

每个维度打 0-100 分。同时列出发现的问题和改进建议。

输出 JSON：{"completeness": N, "accuracy": N, "validity": N, "executability": N, "issues": [...], "suggestions": [...]}"""


def compute_weighted_score(review: SelfReviewResult) -> int:
    """四维加权计算"""
    return round(
        review.completeness * 0.30
        + review.accuracy * 0.25
        + review.validity * 0.25
        + review.executability * 0.20
    )


def compute_total_score(static_warnings_count: int, ai_score: int) -> dict:
    """合成总分（静态50% + 自评50%）"""
    static_score = max(0, 100 - static_warnings_count * 10)
    total = round(static_score * 0.50 + ai_score * 0.50)
    return {
        "total": total,
        "static": static_score,
        "ai_self": ai_score,
    }


async def self_review_case(
    config,
    case_dict: dict,
    session=None,
    project_id=None,
) -> SelfReviewResult:
    """对单条用例执行 AI 四维自评"""
    case_text = f"""标题：{case_dict.get('title', '')}
优先级：{case_dict.get('priority', '')}
前置条件：{case_dict.get('preconditions', '')}
步骤：{case_dict.get('steps', [])}
预期结果：{case_dict.get('expected_result', '')}"""

    messages = [
        {"role": "system", "content": SELF_REVIEW_PROMPT},
        {"role": "user", "content": case_text},
    ]

    return await llm_structured(
        config, messages, SelfReviewResult,
        session=session, project_id=project_id, skill_name="scenario-self-review",
    )
