"""
test_password_hashing — bcrypt hash 生成 + 验证一致性
Test ID: 1.1-UNIT-001
"""
import pytest
from app.core.security import hash_password, verify_password


class TestPasswordHashing:

    def test_hash_and_verify_match(self):
        raw = "Test@123456"
        hashed = hash_password(raw)
        assert verify_password(raw, hashed) is True

    def test_hash_and_verify_mismatch(self):
        hashed = hash_password("correct-password")
        assert verify_password("wrong-password", hashed) is False

    def test_hash_produces_different_outputs(self):
        raw = "same-password"
        hash1 = hash_password(raw)
        hash2 = hash_password(raw)
        assert hash1 != hash2  # bcrypt salt ensures different hashes

    def test_hash_is_not_plaintext(self):
        raw = "my-secret"
        hashed = hash_password(raw)
        assert raw not in hashed
        assert hashed.startswith("$2b$")
