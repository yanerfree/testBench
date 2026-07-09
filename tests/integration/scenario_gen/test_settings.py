"""
test_settings — 阈值配置读取链（ft-1-2）
Test ID: FT.1.2-UNIT-001
Priority: P0
"""
import pytest
from app.services.scenario_gen.settings import ScenarioGenDefaults, get_settings


class TestSettings:

    def test_defaults_match_prd_table(self):
        s = get_settings()
        assert s.health_score_threshold == 70
        assert s.chunk_trigger_chars == 16_000
        assert s.input_max_chars == 200_000
        assert s.p0_ratio_cap == 0.40
        assert s.self_review_threshold == 75
        assert s.self_review_max_rounds == 3
        assert s.structured_output_max_retry == 2
        assert s.reject_reason_inject_count == 5
        assert s.dedup_title_threshold == 0.70
        assert s.case_limit_per_task == 200
        assert "操作成功" in s.fuzzy_assertion_words

    def test_no_overrides_returns_singleton(self):
        assert get_settings() is get_settings(None) is get_settings({})

    def test_project_overrides_scalar(self):
        s = get_settings({"health_score_threshold": 60, "self_review_max_rounds": 5})
        assert s.health_score_threshold == 60
        assert s.self_review_max_rounds == 5
        assert s.chunk_trigger_chars == 16_000  # 未覆盖的保持默认

    def test_project_overrides_list_add_remove(self):
        s = get_settings({
            "fuzzy_assertion_words": {"add": ["一切正常"], "remove": ["操作成功"]},
        })
        assert "一切正常" in s.fuzzy_assertion_words
        assert "操作成功" not in s.fuzzy_assertion_words
        assert "显示正常" in s.fuzzy_assertion_words  # 基础词表保留

    def test_unknown_keys_ignored(self):
        s = get_settings({"nonexistent_key": 42})
        assert s == get_settings()
