"""Unit 测试 — core/security.py 密码哈希与验证"""
import pytest

from app.core.security import hash_password, verify_password


class TestHashPassword:

    @pytest.mark.unit
    def test_returns_bcrypt_format(self):
        h = hash_password("MyPass@123")
        assert h.startswith(("$2b$", "$2a$"))

    @pytest.mark.unit
    def test_cost_at_least_10(self):
        h = hash_password("MyPass@123")
        cost = int(h.split("$")[2])
        assert cost >= 10

    @pytest.mark.unit
    def test_different_passwords_different_hashes(self):
        h1 = hash_password("PassA@111")
        h2 = hash_password("PassB@222")
        assert h1 != h2

    @pytest.mark.unit
    def test_same_password_different_salt(self):
        h1 = hash_password("Same@Pass")
        h2 = hash_password("Same@Pass")
        assert h1 != h2  # bcrypt 每次生成不同 salt


class TestVerifyPassword:

    @pytest.mark.unit
    def test_correct_password_returns_true(self):
        h = hash_password("Correct@123")
        assert verify_password("Correct@123", h) is True

    @pytest.mark.unit
    def test_wrong_password_returns_false(self):
        h = hash_password("Correct@123")
        assert verify_password("Wrong@456", h) is False

    @pytest.mark.unit
    def test_empty_password(self):
        h = hash_password("")
        assert verify_password("", h) is True
        assert verify_password("notempty", h) is False
