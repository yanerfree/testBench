"""
test_healthz — GET /api/healthz 返回 {"status": "ok"}
Test ID: 1.1-INT-001
"""
import pytest


class TestHealthEndpoint:

    async def test_healthz_returns_ok(self, client):
        response = await client.get("/api/healthz")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
