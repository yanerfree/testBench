"""
test_preprocessor — 文档预处理管线（ft S2.2 / FR6 / FR51）
Test ID: FT.2.2-UNIT-001
Priority: P0
"""
import pytest
from app.services.scenario_gen.preprocessor import (
    strip_noise_sections,
    smart_chunk,
    sanitize_input,
    preprocess,
)
from app.services.scenario_gen.settings import ScenarioGenDefaults


class TestStripNoiseSections:

    def test_strips_review_history(self):
        text = "# 需求\n正文\n## 评审记录\n张三 2026-01-01 通过\n## 功能\n功能正文"
        result, stripped = strip_noise_sections(text)
        assert "评审记录" not in result
        assert "功能正文" in result
        assert "评审记录" in stripped

    def test_strips_multiple_noise_sections(self):
        text = "# PRD\n内容\n## 修订历史\n旧版本\n## 附录\n附录内容\n## 核心功能\n核心"
        result, stripped = strip_noise_sections(text)
        assert "旧版本" not in result
        assert "附录内容" not in result
        assert "核心" in result
        assert len(stripped) == 2

    def test_preserves_non_noise_sections(self):
        text = "# 需求\n## 用户管理\n用户内容\n## 权限\n权限内容"
        result, stripped = strip_noise_sections(text)
        assert result.strip() == text.strip()
        assert stripped == []

    def test_strips_english_patterns(self):
        text = "# PRD\ncontent\n## Change Log\nv1.0\n## Features\nfeature"
        result, stripped = strip_noise_sections(text)
        assert "v1.0" not in result
        assert "feature" in result

    def test_nested_heading_levels(self):
        text = "# PRD\n## 评审记录\n### 第一轮\n通过\n### 第二轮\n驳回\n## 功能需求\n正文"
        result, stripped = strip_noise_sections(text)
        assert "第一轮" not in result
        assert "第二轮" not in result
        assert "正文" in result


class TestSmartChunk:

    def test_no_chunk_when_under_threshold(self):
        text = "short text"
        chunks = smart_chunk(text)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_chunks_at_heading_boundary(self):
        cfg = ScenarioGenDefaults(chunk_trigger_chars=50, chunk_size_chars=50)
        text = "# Part1\n" + "a" * 30 + "\n# Part2\n" + "b" * 30
        chunks = smart_chunk(text, settings=cfg)
        assert len(chunks) == 2
        assert "Part1" in chunks[0]
        assert "Part2" in chunks[1]

    def test_large_single_section_stays_together(self):
        cfg = ScenarioGenDefaults(chunk_trigger_chars=20, chunk_size_chars=20)
        text = "# Single\n" + "x" * 100
        chunks = smart_chunk(text, settings=cfg)
        assert len(chunks) >= 1
        assert "x" * 50 in chunks[0]


class TestSanitizeInput:

    def test_strips_control_chars(self):
        text = "hello\x00world\x07test"
        result = sanitize_input(text)
        assert "\x00" not in result
        assert "\x07" not in result
        assert "helloworld" in result

    def test_preserves_newlines_tabs(self):
        text = "line1\nline2\ttab"
        result = sanitize_input(text)
        assert "\n" in result
        assert "\t" in result

    def test_escapes_template_braces(self):
        text = "value is {{user_input}}"
        result = sanitize_input(text)
        assert "{{user_input}}" not in result
        assert "\\{\\{" in result

    def test_truncates_at_max_chars(self):
        text = "a" * 300_000
        result = sanitize_input(text, max_chars=200_000)
        assert len(result) == 200_000

    def test_strips_zero_width_chars(self):
        text = "ab​cd﻿ef"
        result = sanitize_input(text)
        assert result == "abcdef"


class TestPreprocess:

    def test_full_pipeline(self):
        text = "# 需求\n正文内容\n## 评审记录\n张三通过\n## 功能\n功能描述"
        result = preprocess(text)
        assert "评审记录" in result["stripped_sections"]
        assert "正文内容" in result["sanitized"]
        assert result["chunk_count"] >= 1
        assert result["char_count"] > 0

    def test_preprocess_with_custom_settings(self):
        cfg = ScenarioGenDefaults(chunk_trigger_chars=30, input_max_chars=500)
        text = "# A\n" + "x" * 40 + "\n# B\n" + "y" * 40
        result = preprocess(text, settings=cfg)
        assert result["chunk_count"] >= 2
