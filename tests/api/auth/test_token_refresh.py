"""
test_token_refresh — Token 滑动续期中间件验证
Test ID: 1.2-API-007
Priority: P1
"""
import time

import pytest
from joserfc import jwt
from joserfc.jwk import OctKey

from app.config import settings
from tests.conftest import create_test_user, make_auth_headers


class TestTokenRefresh:
    """Token 滑动续期：剩余 < 2h 时 response header 返回 X-New-Token"""

    @pytest.mark.asyncio
    async def test_fresh_token_no_refresh(self, client, db_session):
        # Given: 一个刚签发的 token（剩余 8h，远大于 2h）
        admin = await create_test_user(db_session, username="refresh_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 调用任意 API
        response = await client.get("/api/auth/me", headers=headers)

        # Then: 不返回 X-New-Token
        assert response.status_code == 200
        assert "X-New-Token" not in response.headers

    @pytest.mark.asyncio
    async def test_near_expiry_token_returns_new_token(self, client, db_session):
        # Given: 一个即将过期的 token（剩余 1h，小于 2h 阈值）
        admin = await create_test_user(db_session, username="nearexp_admin", role="admin")
        key = OctKey.import_key(settings.secret_key)
        now = int(time.time())
        payload = {
            "sub": str(admin.id),
            "role": admin.role,
            "iat": now - 7 * 3600,  # 7 小时前签发
            "exp": now + 1 * 3600,  # 还剩 1 小时
        }
        near_expiry_token = jwt.encode({"alg": "HS256"}, payload, key)
        headers = {"Authorization": f"Bearer {near_expiry_token}"}

        # When: 调用任意 API
        response = await client.get("/api/auth/me", headers=headers)

        # Then: response header 包含新 token
        assert response.status_code == 200
        new_token = response.headers.get("X-New-Token")
        assert new_token is not None
        assert new_token != near_expiry_token  # 新 token 与旧 token 不同
