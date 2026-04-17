"""
test_readyz — GET /api/readyz 就绪探针
Test ID: 6.2-API-001
"""
import pytest
from unittest.mock import AsyncMock, patch


class TestReadyzEndpoint:

    @pytest.mark.asyncio
    async def test_readyz_returns_components(self, client):
        """AC: 返回各组件状态详情"""
        response = await client.get("/api/readyz")
        data = response.json()
        assert "status" in data
        assert "components" in data
        assert "db" in data["components"]
        assert "redis" in data["components"]
        assert "disk" in data["components"]

    @pytest.mark.asyncio
    async def test_readyz_healthy_returns_200(self, client):
        """AC: 全部健康返回 200"""
        response = await client.get("/api/readyz")
        # DB 和 Redis 在测试环境中应该都可用
        if response.json()["status"] == "ok":
            assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_readyz_no_auth_required(self, client):
        """AC: 无需鉴权"""
        response = await client.get("/api/readyz")
        assert response.status_code in (200, 503)  # 不应该是 401
