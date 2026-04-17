"""Unit 测试 — core/middleware.py CamelCase 转换"""
import pytest

from app.core.middleware import _to_camel, to_camel_case


class TestToCamel:

    @pytest.mark.unit
    def test_single_word(self):
        assert _to_camel("name") == "name"

    @pytest.mark.unit
    def test_two_words(self):
        assert _to_camel("user_name") == "userName"

    @pytest.mark.unit
    def test_three_words(self):
        assert _to_camel("created_at_utc") == "createdAtUtc"

    @pytest.mark.unit
    def test_already_camel(self):
        assert _to_camel("userName") == "userName"

    @pytest.mark.unit
    def test_empty_string(self):
        assert _to_camel("") == ""


class TestToCamelCase:

    @pytest.mark.unit
    def test_flat_dict(self):
        result = to_camel_case({"user_name": "alice", "is_active": True})
        assert result == {"userName": "alice", "isActive": True}

    @pytest.mark.unit
    def test_nested_dict(self):
        result = to_camel_case({"user_info": {"first_name": "bob"}})
        assert result == {"userInfo": {"firstName": "bob"}}

    @pytest.mark.unit
    def test_list_of_dicts(self):
        result = to_camel_case([{"created_at": "2026"}, {"updated_at": "2026"}])
        assert result == [{"createdAt": "2026"}, {"updatedAt": "2026"}]

    @pytest.mark.unit
    def test_non_dict_passthrough(self):
        assert to_camel_case("hello") == "hello"
        assert to_camel_case(42) == 42
        assert to_camel_case(None) is None

    @pytest.mark.unit
    def test_empty_dict(self):
        assert to_camel_case({}) == {}

    @pytest.mark.unit
    def test_empty_list(self):
        assert to_camel_case([]) == []
