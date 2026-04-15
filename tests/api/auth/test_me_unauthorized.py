"""
test_me_unauthorized — 未授权访问 /me 返回 401
Test ID: 1.2-API-005
Priority: P0
"""
import pytest


class TestMeUnauthorized:
    """GET /api/auth/me：缺失/无效 token 返回 401"""

    @pytest.mark.asyncio
    async def test_no_token_returns_401(self, client):
        # Given: 不携带任何 token
        # When: 调用 /me
        response = await client.get("/api/auth/me")

        # Then: 返回 401
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "MISSING_TOKEN"

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401(self, client):
        # Given: 携带一个无效的 token
        headers = {"Authorization": "Bearer invalid-jwt-token"}

        # When: 调用 /me
        response = await client.get("/api/auth/me", headers=headers)

        # Then: 返回 401
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_TOKEN"

    @pytest.mark.asyncio
    async def test_malformed_auth_header_returns_401(self, client):
        # Given: Authorization header 格式不正确（缺少 Bearer 前缀）
        headers = {"Authorization": "Token some-value"}

        # When: 调用 /me
        response = await client.get("/api/auth/me", headers=headers)

        # Then: 返回 401
        assert response.status_code == 401
