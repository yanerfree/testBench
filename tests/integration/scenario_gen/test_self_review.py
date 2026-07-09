"""
test_self_review — AI 自评回炉评分逻辑（ft S4.3）
Test ID: FT.4.3-UNIT-001
Priority: P0
"""
import pytest
from app.services.scenario_gen.self_review import (
    SelfReviewResult,
    compute_weighted_score,
    compute_total_score,
)


class TestComputeWeightedScore:

    def test_perfect_scores(self):
        r = SelfReviewResult(completeness=100, accuracy=100, validity=100, executability=100)
        assert compute_weighted_score(r) == 100

    def test_all_zero(self):
        r = SelfReviewResult(completeness=0, accuracy=0, validity=0, executability=0)
        assert compute_weighted_score(r) == 0

    def test_weighted_calculation(self):
        r = SelfReviewResult(completeness=80, accuracy=70, validity=60, executability=50)
        expected = round(80 * 0.30 + 70 * 0.25 + 60 * 0.25 + 50 * 0.20)
        assert compute_weighted_score(r) == expected  # 66.5 → 66

    def test_threshold_boundary(self):
        r = SelfReviewResult(completeness=75, accuracy=75, validity=75, executability=75)
        assert compute_weighted_score(r) == 75


class TestComputeTotalScore:

    def test_perfect_both(self):
        result = compute_total_score(0, 100)
        assert result["total"] == 100
        assert result["static"] == 100
        assert result["ai_self"] == 100

    def test_many_warnings_degrade_static(self):
        result = compute_total_score(5, 80)
        assert result["static"] == 50
        assert result["total"] == round(50 * 0.50 + 80 * 0.50)  # 65

    def test_static_floor_at_zero(self):
        result = compute_total_score(20, 80)
        assert result["static"] == 0
        assert result["total"] == 40  # 0*0.5 + 80*0.5

    def test_zero_ai_score(self):
        result = compute_total_score(0, 0)
        assert result["total"] == 50  # 100*0.5 + 0*0.5
