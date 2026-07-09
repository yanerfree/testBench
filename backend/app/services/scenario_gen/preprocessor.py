"""文档预处理管线（ft S2.2 / FR6 / FR51）

三步处理需求文档后再送入 LLM：
1. 噪声章节剥离（评审记录/修订历史/附录等 — 防 AI 对其挑刺产生误报）
2. 标题感知分块（超长文档按阈值分块，块边界优先落在 Markdown 标题处）
3. 输入消毒（控制字符/模板语法/长度）

全部纯函数，零 IO，可独立单测。
"""
from __future__ import annotations

import re
import unicodedata

from app.services.scenario_gen.settings import ScenarioGenDefaults, get_settings

# ── 1. 噪声章节剥离 ─────────────────────────────────────────────────

NOISE_PATTERNS: list[re.Pattern] = [
    re.compile(r"^#{1,4}\s*(评审记录|审阅记录|review\s*history|review\s*log)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(修订历史|变更历史|revision\s*history|change\s*log|changelog)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(附录|appendix|appendices)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(签署|sign[-\s]?off|approval)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(版本号|version\s*info)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(发布说明|release\s*notes)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(术语表|glossary)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(参考文献|references|bibliography)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(致谢|acknowledgement)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(模板说明|template\s*instructions)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(文档控制|document\s*control)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(分发列表|distribution\s*list)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(缩略语|abbreviations)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^#{1,4}\s*(目录|table\s*of\s*contents)", re.IGNORECASE | re.MULTILINE),
]

_HEADING_RE = re.compile(r"^(#{1,6})\s", re.MULTILINE)


def strip_noise_sections(
    text: str,
    extra_patterns: list[re.Pattern] | None = None,
) -> tuple[str, list[str]]:
    """剥离噪声章节，返回 (清理后文本, 被剥离的章节标题列表)。

    剥离规则：匹配到噪声标题后，向下删除到同级或更高级标题为止。
    """
    patterns = NOISE_PATTERNS + (extra_patterns or [])
    stripped_titles: list[str] = []

    lines = text.split("\n")
    result_lines: list[str] = []
    skip_until_level: int | None = None

    for line in lines:
        heading_match = _HEADING_RE.match(line)

        if skip_until_level is not None:
            if heading_match and len(heading_match.group(1)) <= skip_until_level:
                skip_until_level = None
            else:
                continue

        if heading_match:
            for pat in patterns:
                if pat.match(line):
                    skip_until_level = len(heading_match.group(1))
                    stripped_titles.append(line.strip().lstrip("#").strip())
                    break
            else:
                result_lines.append(line)
        else:
            result_lines.append(line)

    return "\n".join(result_lines), stripped_titles


# ── 2. 标题感知分块 ─────────────────────────────────────────────────

def smart_chunk(
    text: str,
    settings: ScenarioGenDefaults | None = None,
) -> list[str]:
    """按阈值分块，块边界优先落在 Markdown 标题处。

    返回块列表（每块含完整上下文前缀：标题面包屑）。
    不超过阈值则返回单块。
    """
    cfg = settings or get_settings()
    max_chars = cfg.chunk_trigger_chars
    if len(text) <= max_chars:
        return [text]

    # 按标题切段
    segments: list[tuple[str, str]] = []  # (heading_breadcrumb, content)
    current_heading = ""
    current_content_lines: list[str] = []

    for line in text.split("\n"):
        heading_match = _HEADING_RE.match(line)
        if heading_match:
            if current_content_lines:
                segments.append((current_heading, "\n".join(current_content_lines)))
            current_heading = line.strip()
            current_content_lines = [line]
        else:
            current_content_lines.append(line)
    if current_content_lines:
        segments.append((current_heading, "\n".join(current_content_lines)))

    # 贪心合并段到块
    chunks: list[str] = []
    current_chunk_parts: list[str] = []
    current_size = 0

    for _heading, content in segments:
        seg_len = len(content)
        if current_size + seg_len > max_chars and current_chunk_parts:
            chunks.append("\n\n".join(current_chunk_parts))
            current_chunk_parts = []
            current_size = 0
        current_chunk_parts.append(content)
        current_size += seg_len

    if current_chunk_parts:
        chunks.append("\n\n".join(current_chunk_parts))

    return chunks


# ── 3. 输入消毒 ─────────────────────────────────────────────────────

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TEMPLATE_BRACE_RE = re.compile(r"\{\{([^}]+)\}\}")


def sanitize_input(text: str, max_chars: int | None = None) -> str:
    """消毒用户输入文本：

    - 剥离 unicode Cc 控制字符（保留 \\n\\r\\t）
    - 转义模板花括号 {{ → \\{\\{（防 prompt 注入意外）
    - 长度截断（默认取阈值配置的 input_max_chars）
    """
    text = _CONTROL_RE.sub("", text)

    # 剥离 unicode format 字符（Cf 类别，如零宽空格）
    text = "".join(c for c in text if unicodedata.category(c) != "Cf")

    text = _TEMPLATE_BRACE_RE.sub(r"\\{\\{\1\\}\\}", text)

    if max_chars is None:
        max_chars = get_settings().input_max_chars
    if len(text) > max_chars:
        text = text[:max_chars]

    return text


# ── 组合入口 ─────────────────────────────────────────────────────────

def preprocess(
    content: str,
    settings: ScenarioGenDefaults | None = None,
) -> dict:
    """预处理全流程：消毒 → 噪声剥离 → 分块。

    返回：
        {
            "sanitized": str,         # 消毒后全文
            "stripped_sections": [],   # 被剥离的章节标题
            "chunks": [str, ...],     # 分块结果
            "char_count": int,        # 消毒后字符数
            "chunk_count": int,
        }
    """
    cfg = settings or get_settings()
    sanitized = sanitize_input(content, max_chars=cfg.input_max_chars)
    cleaned, stripped = strip_noise_sections(sanitized)
    chunks = smart_chunk(cleaned, settings=cfg)
    return {
        "sanitized": cleaned,
        "stripped_sections": stripped,
        "chunks": chunks,
        "char_count": len(cleaned),
        "chunk_count": len(chunks),
    }
