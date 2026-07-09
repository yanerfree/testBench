"""
test_health_check_scoring — 健康分代码加权计算（ft S2.4 / FR5）
Test ID: FT.2.4-UNIT-001
Priority: P0
"""
import pytest
from app.services.scenario_gen.health_check import compute_health_score, QualityIssue


def _make_issue(severity: str) -> QualityIssue:
    return QualityIssue(
        category="歧义描述", severity=severity,
        description="测试", quote="", suggestion="",
    )


class TestComputeHealthScore:

    def test_no_issues_perfect_score(self):
        assert compute_health_score([]) == 100

    def test_single_critical_deduction(self):
        assert compute_health_score([_make_issue("critical")]) == 85

    def test_single_major_deduction(self):
        assert compute_health_score([_make_issue("major")]) == 92

    def test_single_minor_deduction(self):
        assert compute_health_score([_make_issue("minor")]) == 97

    def test_mixed_severity(self):
        issues = [_make_issue("critical"), _make_issue("major"), _make_issue("minor")]
        assert compute_health_score(issues) == 100 - 15 - 8 - 3  # 74

    def test_floor_at_zero(self):
        issues = [_make_issue("critical")] * 10
        assert compute_health_score(issues) == 0

    def test_below_threshold_detection(self):
        # 默认阈值 70：1 critical + 2 major = 100 - 15 - 16 = 69 < 70
        issues = [_make_issue("critical"), _make_issue("major"), _make_issue("major")]
        score = compute_health_score(issues)
        assert score == 69
        from app.services.scenario_gen.settings import get_settings
        cfg = get_settings()
        assert score < cfg.health_score_threshold

    def test_unknown_severity_defaults_to_minor(self):
        assert compute_health_score([_make_issue("unknown")]) == 97
