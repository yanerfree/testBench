"""
test_jwt_decode_token — JWT token 解码与验证
Test ID: 1.2-UNIT-002
Priority: P0
"""
import time
import uuid

import pytest

from app.core.exceptions import UnauthorizedError
from app.core.security import create_access_token, decode_token


class TestJwtDecodeToken:
    """JWT token 解码：验证正常解码、过期拒绝、篡改拒绝"""

    def test_decode_valid_token(self):
        # Given: 一个有效的 token
        user_id = uuid.uuid4()
        token = create_access_token(user_id, "admin")

        # When: 解码
        claims = decode_token(token)

        # Then: claims 包含正确的 sub 和 role
        assert claims["sub"] == str(user_id)
        assert claims["role"] == "admin"

    def test_decode_tampered_token_raises(self):
        # Given: 一个被篡改的 token
        token = create_access_token(uuid.uuid4(), "user")
        tampered = token[:-5] + "XXXXX"

        # When/Then: 解码失败抛 UnauthorizedError
        with pytest.raises(UnauthorizedError) as exc_info:
            decode_token(tampered)
        assert exc_info.value.code == "INVALID_TOKEN"

    def test_decode_garbage_string_raises(self):
        # Given: 完全无效的字符串
        # When/Then: 抛 UnauthorizedError
        with pytest.raises(UnauthorizedError) as exc_info:
            decode_token("not-a-jwt-token")
        assert exc_info.value.code == "INVALID_TOKEN"

    def test_decode_expired_token_raises(self):
        # Given: 一个已过期的 token（手动构造 exp 在过去）
        from joserfc import jwt as jose_jwt
        from joserfc.jwk import OctKey
        from app.config import settings

        key = OctKey.import_key(settings.secret_key)
        now = int(time.time())
        payload = {"sub": str(uuid.uuid4()), "role": "user", "iat": now - 7200, "exp": now - 3600}
        expired_token = jose_jwt.encode({"alg": "HS256"}, payload, key)

        # When/Then: 解码失败
        with pytest.raises(UnauthorizedError) as exc_info:
            decode_token(expired_token)
        assert exc_info.value.code == "INVALID_TOKEN"
