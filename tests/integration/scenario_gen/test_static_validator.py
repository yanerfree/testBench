"""
test_static_validator — 零 token 静态校验器（ft S4.2 / FR54）
Test ID: FT.4.2-UNIT-001
Priority: P0
"""
import pytest
from app.services.scenario_gen.static_validator import validate_cases
from app.services.scenario_gen.settings import ScenarioGenDefaults


def _case(title="测试", priority="P1", expected="验证返回状态码 200", steps=None):
    return {
        "title": title,
        "priority": priority,
        "expected_result": expected,
        "steps": steps or [{"action": "点击", "expected": "成功"}],
    }


class TestStaticValidator:

    def test_no_issues_clean_cases(self):
        cases = [_case("登录成功"), _case("登录失败")]
        result, warnings = validate_cases(cases)
        assert len(warnings) == 0

    def test_fuzzy_assertion_detected(self):
        cases = [_case(expected="操作成功")]
        _, warnings = validate_cases(cases)
        fuzzy = [w for w in warnings if w["rule"] == "fuzzy_assertion"]
        assert len(fuzzy) == 1
        assert "操作成功" in fuzzy[0]["message"]

    def test_fuzzy_assertion_in_step_expected(self):
        cases = [_case(steps=[{"action": "提交", "expected": "显示正常"}])]
        _, warnings = validate_cases(cases)
        assert any(w["rule"] == "fuzzy_assertion" for w in warnings)

    def test_p0_ratio_cap_auto_downgrade(self):
        cfg = ScenarioGenDefaults(p0_ratio_cap=0.40)
        cases = [_case(f"case{i}", priority="P0") for i in range(10)]
        result, warnings = validate_cases(cases, settings=cfg)
        p0_count = sum(1 for c in result if c["priority"] == "P0")
        assert p0_count <= 4  # 40% of 10
        downgraded = [w for w in warnings if w["rule"] == "p0_ratio_cap"]
        assert len(downgraded) == 6
        assert all(w["auto_fixed"] for w in downgraded)

    def test_duplicate_title_warning(self):
        cases = [_case("相同标题"), _case("不同"), _case("相同标题")]
        _, warnings = validate_cases(cases)
        dups = [w for w in warnings if w["rule"] == "duplicate_title"]
        assert len(dups) == 1

    def test_missing_title_warning(self):
        cases = [_case(title="")]
        _, warnings = validate_cases(cases)
        assert any(w["rule"] == "missing_title" for w in warnings)

    def test_missing_steps_warning(self):
        cases = [{"title": "有标题", "priority": "P1", "expected_result": "有预期", "steps": []}]
        _, warnings = validate_cases(cases)
        assert any(w["rule"] == "missing_steps" for w in warnings)

    def test_missing_expected_warning(self):
        cases = [_case(expected="")]
        _, warnings = validate_cases(cases)
        assert any(w["rule"] == "missing_expected" for w in warnings)

    def test_custom_fuzzy_words(self):
        cfg = ScenarioGenDefaults(fuzzy_assertion_words=["一切正常", "没问题"])
        cases = [_case(expected="一切正常")]
        _, warnings = validate_cases(cases, settings=cfg)
        assert any(w["rule"] == "fuzzy_assertion" for w in warnings)
        # 默认词表不再生效
        cases2 = [_case(expected="操作成功")]
        _, warnings2 = validate_cases(cases2, settings=cfg)
        assert not any(w["rule"] == "fuzzy_assertion" for w in warnings2)
