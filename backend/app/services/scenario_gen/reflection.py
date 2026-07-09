"""Reflection 覆盖补漏（ft S4.8 / FR55）

展开完成后自动审查五类遗漏，结合覆盖矩阵产出补充建议。
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.services.scenario_gen.llm_structured import llm_structured


class CoverageGap(BaseModel):
    requirement_point_code: str
    dimension: str
    reason: str
    suggested_title: str


class ReflectionResult(BaseModel):
    gaps: list[CoverageGap] = []


REFLECTION_PROMPT = """你是一位测试覆盖审查专家。审查已生成的用例标题清单，专项检查以下五类遗漏：

1. **边界值** — 数值/长度/数量的极限值是否覆盖
2. **权限** — 不同角色的权限校验是否覆盖
3. **并发** — 多人同时操作的冲突场景
4. **数据状态** — 数据在不同状态下的行为差异
5. **跨功能联动** — 与其他模块/功能的交互影响

对每个发现的遗漏输出：
- requirement_point_code: 关联的需求点编号
- dimension: 遗漏的维度 (boundary/permission/data/state/negative)
- reason: 为什么认为这是遗漏
- suggested_title: 建议新增的用例标题

如果覆盖已完整，输出空 gaps 数组。
输出 JSON：{"gaps": [...]}"""


async def check_coverage_gaps(
    config,
    case_titles: list[str],
    requirement_points: list[dict],
    session=None,
    project_id=None,
) -> list[dict]:
    """审查覆盖遗漏，返回建议清单"""
    titles_text = "\n".join(f"- {t}" for t in case_titles[:150])
    points_text = "\n".join(f"- {p.get('code', '')}: {p.get('title', '')}" for p in requirement_points)

    messages = [
        {"role": "system", "content": REFLECTION_PROMPT},
        {"role": "user", "content": f"需求点：\n{points_text}\n\n已生成用例：\n{titles_text}\n\n请检查五类遗漏。"},
    ]

    result = await llm_structured(
        config, messages, ReflectionResult,
        session=session, project_id=project_id, skill_name="scenario-reflection",
    )
    return [g.model_dump() for g in result.gaps]
