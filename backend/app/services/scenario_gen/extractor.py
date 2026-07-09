"""需求点提取 + 原文引用锚定（ft S2.3 / FR3 / ADR-8）

三级锚定降级：
1. 精确匹配 offset → anchored
2. 空白规格化 + 最长公共子串 ≥80% → fuzzy
3. 仍失败 → unanchored（保留需求点，UI 显示"未能定位原文"）

绝不做"近似高亮"欺骗用户（FR68 诚实 UI）。
"""
from __future__ import annotations

import re
import uuid
from difflib import SequenceMatcher

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scenario_gen import RequirementPoint
from app.services.scenario_gen.llm_structured import llm_structured
from app.services.scenario_gen.settings import get_settings


class ExtractedPoint(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    exact_quote: str = Field(default="", max_length=2000)


class ExtractionResult(BaseModel):
    points: list[ExtractedPoint]


EXTRACTION_SYSTEM_PROMPT = """你是一位需求分析专家。从用户提供的需求文档中提取所有可测试的需求点。

每个需求点必须包含：
- title: 需求点的简短标题（中文，≤50字）
- exact_quote: 需求文档中支持该需求点的**原文逐字片段**（必须是文档中的原始文字，不要改写）

规则：
- 提取所有可以转化为测试用例的功能需求、业务规则、约束条件
- 不要提取非功能需求（性能、安全等）—— 这些由用户单独处理
- exact_quote 必须是文档原文的精确子串，不要增删改任何字
- 如果一段文字包含多个独立需求，拆分为多个需求点

输出严格 JSON 格式：{"points": [{"title": "...", "exact_quote": "..."}, ...]}"""


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def anchor_quote(doc_text: str, quote: str) -> tuple[str, int | None]:
    """三级锚定降级（ADR-8）。返回 (anchor_status, offset)。"""
    if not quote or not quote.strip():
        return "unanchored", None

    # Level 1: 精确匹配
    offset = doc_text.find(quote)
    if offset >= 0:
        return "anchored", offset

    # Level 2: 空白规格化 + 相似度判定
    norm_doc = _normalize_whitespace(doc_text)
    norm_quote = _normalize_whitespace(quote)
    offset_norm = norm_doc.find(norm_quote)
    if offset_norm >= 0:
        return "fuzzy", None

    # 整体相似度 ≥0.60 且最长公共子串覆盖 ≥50% → fuzzy（适配 LLM 轻微改写场景）
    sm = SequenceMatcher(None, norm_quote, norm_doc)
    if sm.ratio() >= 0.60:
        lcs = sm.find_longest_match(0, len(norm_quote), 0, len(norm_doc))
        if lcs.size > 0 and lcs.size / len(norm_quote) >= 0.50:
            return "fuzzy", None

    # Level 3: 锚定失败
    return "unanchored", None


async def extract_requirement_points(
    config,
    doc_content: str,
    task_id: uuid.UUID,
    doc_id: uuid.UUID,
    session: AsyncSession,
    project_id: uuid.UUID,
    chunks: list[str] | None = None,
) -> list[RequirementPoint]:
    """提取需求点并锚定原文引用。分块文档逐块提取后合并去重。"""
    cfg = get_settings()
    all_points: list[ExtractedPoint] = []

    target_chunks = chunks if chunks and len(chunks) > 1 else [doc_content]

    for i, chunk in enumerate(target_chunks):
        user_msg = chunk
        if len(target_chunks) > 1:
            user_msg = f"[长文档节选第 {i+1}/{len(target_chunks)} 段，直接分析勿等待]\n\n{chunk}"

        messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ]
        result = await llm_structured(
            config, messages, ExtractionResult,
            session=session, project_id=project_id, skill_name="scenario-extract",
        )
        all_points.extend(result.points)

    # 跨块去重（按 title 精确去重）
    seen_titles: set[str] = set()
    unique_points: list[ExtractedPoint] = []
    for p in all_points:
        if p.title not in seen_titles:
            seen_titles.add(p.title)
            unique_points.append(p)

    # 锚定 + 入库
    db_points: list[RequirementPoint] = []
    for seq, point in enumerate(unique_points, 1):
        anchor_status, offset = anchor_quote(doc_content, point.exact_quote)
        rp = RequirementPoint(
            task_id=task_id,
            doc_id=doc_id,
            code=f"R{seq}",
            title=point.title[:300],
            quote_text=point.exact_quote[:2000] if point.exact_quote else None,
            quote_offset=offset,
            anchor_status=anchor_status,
            status="active",
            created_by_ai=True,
            sort_order=seq,
        )
        session.add(rp)
        db_points.append(rp)

    await session.flush()
    return db_points
