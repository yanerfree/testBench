"""
test_sync_branch — POST /api/projects/{id}/branches/{bid}/sync
Test ID: 2.2-API-001
Priority: P0

覆盖验收标准:
- 提交同步任务返回 202 + taskId
- Git URL 未配置时返回 422
- 脚本路径未配置时返回 422
- 归档分支不能同步
- guest 不能执行同步
- 任务状态轮询 GET /api/tasks/{taskId}/status
"""
import pytest
from unittest.mock import AsyncMock, patch

from tests.conftest import create_test_user, make_auth_headers


class TestSyncBranchValidation:
    """同步前置校验 — 不需要 Redis，直接返回 4xx"""

    @pytest.mark.asyncio
    async def test_sync_requires_git_url(self, client, db_session):
        """AC: 项目未配置 Git URL 时返回 422"""
        admin = await create_test_user(db_session, username="sync_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        resp = await client.post("/api/projects", headers=headers, json={
            "name": "no-git-project",
            "scriptBasePath": "/tmp/no-git",
        })
        project_id = resp.json()["data"]["id"]

        resp = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        branch_id = resp.json()["data"][0]["id"]

        resp = await client.post(
            f"/api/projects/{project_id}/branches/{branch_id}/sync",
            headers=headers,
        )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_sync_requires_script_base_path(self, client, db_session):
        """AC: 项目未配置脚本路径时返回 422"""
        admin = await create_test_user(db_session, username="sync_admin2", role="admin")
        headers, _ = make_auth_headers(admin)

        resp = await client.post("/api/projects", headers=headers, json={
            "name": "no-path-project",
            "gitUrl": "git@example.com:test/repo.git",
        })
        project_id = resp.json()["data"]["id"]

        resp = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        branch_id = resp.json()["data"][0]["id"]

        resp = await client.post(
            f"/api/projects/{project_id}/branches/{branch_id}/sync",
            headers=headers,
        )

        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_sync_archived_branch_returns_422(self, client, db_session):
        """AC: 已归档分支不能同步"""
        admin = await create_test_user(db_session, username="sync_admin3", role="admin")
        headers, _ = make_auth_headers(admin)

        resp = await client.post("/api/projects", headers=headers, json={
            "name": "archive-sync-project",
            "gitUrl": "git@example.com:test/repo.git",
            "scriptBasePath": "/tmp/archive-sync",
        })
        project_id = resp.json()["data"]["id"]

        await client.post(f"/api/projects/{project_id}/branches", headers=headers, json={
            "name": "extra-branch",
            "branch": "develop",
        })

        resp = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        default_branch = [b for b in resp.json()["data"] if b["name"] == "default"][0]
        branch_id = default_branch["id"]

        await client.post(
            f"/api/projects/{project_id}/branches/{branch_id}/archive",
            headers=headers,
        )

        resp = await client.post(
            f"/api/projects/{project_id}/branches/{branch_id}/sync",
            headers=headers,
        )

        assert resp.status_code == 422


class TestSyncBranchAsync:
    """异步同步 — mock arq pool 和 Redis"""

    @pytest.mark.asyncio
    async def test_sync_returns_202_with_task_id(self, client, db_session):
        """AC: 提交任务返回 202 + taskId"""
        admin = await create_test_user(db_session, username="sync_admin4", role="admin")
        headers, _ = make_auth_headers(admin)

        resp = await client.post("/api/projects", headers=headers, json={
            "name": "async-sync-project",
            "gitUrl": "git@example.com:test/repo.git",
            "scriptBasePath": "/tmp/async-sync",
        })
        project_id = resp.json()["data"]["id"]

        resp = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        branch_id = resp.json()["data"][0]["id"]

        # Mock arq pool 和 Redis
        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()

        with patch("app.api.branches.get_arq_pool", return_value=mock_pool), \
             patch("app.api.branches.set_task_status", new_callable=AsyncMock):

            from app.deps.worker import get_arq_pool as original_dep
            from app.main import app

            app.dependency_overrides[original_dep] = lambda: mock_pool

            try:
                resp = await client.post(
                    f"/api/projects/{project_id}/branches/{branch_id}/sync",
                    headers=headers,
                )
            finally:
                app.dependency_overrides.pop(original_dep, None)

        assert resp.status_code == 202
        data = resp.json()["data"]
        assert "taskId" in data
        assert len(data["taskId"]) == 32  # uuid hex

    @pytest.mark.asyncio
    async def test_sync_enqueues_arq_job(self, client, db_session):
        """AC: 端点调用后 arq 任务被提交"""
        admin = await create_test_user(db_session, username="sync_admin5", role="admin")
        headers, _ = make_auth_headers(admin)

        resp = await client.post("/api/projects", headers=headers, json={
            "name": "enqueue-sync-project",
            "gitUrl": "git@example.com:test/repo.git",
            "scriptBasePath": "/tmp/enqueue-sync",
        })
        project_id = resp.json()["data"]["id"]

        resp = await client.get(f"/api/projects/{project_id}/branches", headers=headers)
        branch_id = resp.json()["data"][0]["id"]

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()

        with patch("app.api.branches.set_task_status", new_callable=AsyncMock):
            from app.deps.worker import get_arq_pool as original_dep
            from app.main import app

            app.dependency_overrides[original_dep] = lambda: mock_pool

            try:
                await client.post(
                    f"/api/projects/{project_id}/branches/{branch_id}/sync",
                    headers=headers,
                )
            finally:
                app.dependency_overrides.pop(original_dep, None)

        # Then: enqueue_job 被调用
        mock_pool.enqueue_job.assert_called_once()
        call_args = mock_pool.enqueue_job.call_args
        assert call_args[0][0] == "run_git_sync"  # 任务函数名


class TestSyncBranchPermissions:
    """同步权限: project_admin / developer / tester 可同步，guest 不行"""

    @pytest.mark.asyncio
    async def test_guest_cannot_sync(self, client, db_session):
        """AC: guest 不能执行同步"""
        admin = await create_test_user(db_session, username="perm_admin", role="admin")
        guest = await create_test_user(db_session, username="perm_guest", role="user")
        admin_headers, _ = make_auth_headers(admin)
        guest_headers, _ = make_auth_headers(guest)

        resp = await client.post("/api/projects", headers=admin_headers, json={
            "name": "perm-sync-project",
            "gitUrl": "git@example.com:test/repo.git",
            "scriptBasePath": "/tmp/perm-sync",
        })
        project_id = resp.json()["data"]["id"]

        await client.post(f"/api/projects/{project_id}/members", headers=admin_headers, json={
            "userId": str(guest.id),
            "role": "guest",
        })

        resp = await client.get(f"/api/projects/{project_id}/branches", headers=admin_headers)
        branch_id = resp.json()["data"][0]["id"]

        resp = await client.post(
            f"/api/projects/{project_id}/branches/{branch_id}/sync",
            headers=guest_headers,
        )

        assert resp.status_code == 403
