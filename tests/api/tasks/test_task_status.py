"""
test_task_status — GET /api/tasks/{taskId}/status
覆盖: 任务状态查询、不存在的任务、未认证访问
"""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import create_test_user, make_auth_headers


class TestTaskStatus:

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401(self, client):
        """未认证用户不能查询任务状态"""
        response = await client.get("/api/tasks/abc123/status")
        assert response.status_code == 401

    @pytest.mark.asyncio
    @patch("app.api.tasks.get_task_status", new_callable=AsyncMock)
    async def test_nonexistent_task_returns_404(self, mock_get, client, db_session):
        """不存在的任务返回 404"""
        mock_get.return_value = None

        user = await create_test_user(db_session, username="task_user", role="user")
        headers, _ = make_auth_headers(user)

        response = await client.get("/api/tasks/nonexistent123/status", headers=headers)
        assert response.status_code == 404

    @pytest.mark.asyncio
    @patch("app.api.tasks.get_task_status", new_callable=AsyncMock)
    async def test_pending_task_returns_status(self, mock_get, client, db_session):
        """pending 状态的任务正确返回"""
        mock_get.return_value = {
            "taskId": "abc123",
            "status": "pending",
            "message": "任务已提交",
            "result": None,
        }

        user = await create_test_user(db_session, username="task_user2", role="user")
        headers, _ = make_auth_headers(user)

        response = await client.get("/api/tasks/abc123/status", headers=headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["taskId"] == "abc123"
        assert data["status"] == "pending"

    @pytest.mark.asyncio
    @patch("app.api.tasks.get_task_status", new_callable=AsyncMock)
    async def test_completed_task_includes_result(self, mock_get, client, db_session):
        """completed 任务包含 result"""
        mock_get.return_value = {
            "taskId": "done456",
            "status": "completed",
            "message": "同步完成",
            "result": {"commitSha": "abc123", "firstTime": True, "added": 3, "modified": 0, "deleted": 0},
        }

        user = await create_test_user(db_session, username="task_user3", role="user")
        headers, _ = make_auth_headers(user)

        response = await client.get("/api/tasks/done456/status", headers=headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["status"] == "completed"
        assert data["result"]["commitSha"] == "abc123"

    @pytest.mark.asyncio
    @patch("app.api.tasks.get_task_status", new_callable=AsyncMock)
    async def test_failed_task_returns_error_message(self, mock_get, client, db_session):
        """failed 任务包含错误信息"""
        mock_get.return_value = {
            "taskId": "fail789",
            "status": "failed",
            "message": "Git 认证失败",
            "result": None,
        }

        user = await create_test_user(db_session, username="task_user4", role="user")
        headers, _ = make_auth_headers(user)

        response = await client.get("/api/tasks/fail789/status", headers=headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["status"] == "failed"
        assert "认证失败" in data["message"]
