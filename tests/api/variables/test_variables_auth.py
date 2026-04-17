"""
test_variables_auth — 变量/环境/渠道模块的认证测试
覆盖: 未认证用户不能访问任何变量/环境/渠道端点
"""
import pytest


class TestVariablesAuth:

    @pytest.mark.asyncio
    async def test_global_variables_requires_auth(self, client):
        """未认证不能访问全局变量"""
        response = await client.get("/api/global-variables")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_environments_requires_auth(self, client):
        """未认证不能访问环境"""
        response = await client.get("/api/environments")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_channels_requires_auth(self, client):
        """未认证不能访问通知渠道"""
        response = await client.get("/api/channels")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_global_variable_requires_auth(self, client):
        """未认证不能创建全局变量"""
        response = await client.post("/api/global-variables", json={
            "key": "TEST_VAR", "value": "test",
        })
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_environment_requires_auth(self, client):
        """未认证不能创建环境"""
        response = await client.post("/api/environments", json={"name": "test-env"})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_channel_requires_auth(self, client):
        """未认证不能创建渠道"""
        response = await client.post("/api/channels", json={
            "name": "test-ch", "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=test",
        })
        assert response.status_code == 401
