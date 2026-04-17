"""
test_audit_logs — 审计日志模块测试
Priority: P0

覆盖验收标准:
- @audit_log 装饰器自动记录日志
- write_audit_log 手动写入
- GET /api/logs admin 全局查看
- GET /api/logs 非 admin 返回 403
- GET /api/projects/{id}/logs 项目成员可查看
- 筛选: action, target_type, 时间范围, 关键字
- 分页
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.core.audit import audit_log, set_audit_context, write_audit_log
from app.models.audit_log import AuditLog
from tests.conftest import create_test_user, make_auth_headers


# ---------------------------------------------------------------------------
# 装饰器 + 手动写入测试
# ---------------------------------------------------------------------------
class TestAuditLogWrite:

    @pytest.mark.asyncio
    async def test_write_audit_log_creates_record(self, db_session):
        """AC: write_audit_log 写入审计日志"""
        user = await create_test_user(db_session, username="audit_user", role="admin")

        await write_audit_log(
            session=db_session,
            action="create",
            target_type="user",
            target_id=user.id,
            target_name="audit_user",
            user_id=user.id,
            trace_id="trace-001",
        )

        result = await db_session.execute(select(AuditLog))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].action == "create"
        assert logs[0].target_type == "user"
        assert logs[0].target_name == "audit_user"
        assert logs[0].trace_id == "trace-001"

    @pytest.mark.asyncio
    async def test_write_audit_log_uses_context(self, db_session):
        """AC: write_audit_log 从 contextvars 获取 user_id 和 trace_id"""
        user = await create_test_user(db_session, username="ctx_user", role="admin")

        set_audit_context(user_id=user.id, trace_id="ctx-trace-002")

        await write_audit_log(
            session=db_session,
            action="update",
            target_type="project",
        )

        result = await db_session.execute(select(AuditLog))
        log = result.scalar_one()
        assert log.user_id == user.id
        assert log.trace_id == "ctx-trace-002"

    @pytest.mark.asyncio
    async def test_audit_log_decorator(self, db_session):
        """AC: @audit_log 装饰器自动记录"""
        user = await create_test_user(db_session, username="deco_user", role="admin")
        set_audit_context(user_id=user.id, trace_id="deco-trace")

        @audit_log(action="create", target_type="user")
        async def fake_create_user(session):
            return user  # 返回 ORM 对象，装饰器提取 .id 和 .username

        await fake_create_user(db_session)

        result = await db_session.execute(select(AuditLog))
        log = result.scalar_one()
        assert log.action == "create"
        assert log.target_type == "user"
        assert log.target_id == user.id
        assert log.target_name == "deco_user"

    @pytest.mark.asyncio
    async def test_audit_log_decorator_does_not_break_on_failure(self, db_session):
        """AC: 装饰器写日志失败不影响主业务"""
        @audit_log(action="delete", target_type="case")
        async def fake_delete(session):
            return None  # 返回 None，装饰器不应抛异常

        result = await fake_delete(db_session)
        assert result is None  # 主业务正常返回


# ---------------------------------------------------------------------------
# 全局日志 API
# ---------------------------------------------------------------------------
class TestGlobalLogsAPI:

    @pytest.mark.asyncio
    async def test_admin_can_list_global_logs(self, client, db_session):
        """AC: GET /api/logs admin 可查看全局日志"""
        admin = await create_test_user(db_session, username="log_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # 写入一条日志
        await write_audit_log(
            session=db_session, action="create", target_type="project",
            target_name="test-project", user_id=admin.id,
        )
        await db_session.commit()

        response = await client.get("/api/logs", headers=headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    @pytest.mark.asyncio
    async def test_non_admin_cannot_list_global_logs(self, client, db_session):
        """AC: 非 admin 返回 403"""
        user = await create_test_user(db_session, username="log_user", role="user")
        headers, _ = make_auth_headers(user)

        response = await client.get("/api/logs", headers=headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_filter_by_action(self, client, db_session):
        """AC: 支持按操作类型筛选"""
        admin = await create_test_user(db_session, username="filter_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        await write_audit_log(db_session, action="create", target_type="user", target_name="u1", user_id=admin.id)
        await write_audit_log(db_session, action="delete", target_type="user", target_name="u2", user_id=admin.id)
        await db_session.commit()

        response = await client.get("/api/logs?action=create", headers=headers)
        data = response.json()["data"]
        assert all(item["action"] == "create" for item in data["items"])

    @pytest.mark.asyncio
    async def test_filter_by_keyword(self, client, db_session):
        """AC: 支持关键字搜索（对象名称）"""
        admin = await create_test_user(db_session, username="kw_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        await write_audit_log(db_session, action="create", target_type="project", target_name="alpha-project", user_id=admin.id)
        await write_audit_log(db_session, action="create", target_type="project", target_name="beta-project", user_id=admin.id)
        await db_session.commit()

        response = await client.get("/api/logs?keyword=alpha", headers=headers)
        data = response.json()["data"]
        assert data["total"] == 1
        assert data["items"][0]["targetName"] == "alpha-project"

    @pytest.mark.asyncio
    async def test_pagination(self, client, db_session):
        """AC: 分页加载"""
        admin = await create_test_user(db_session, username="page_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        for i in range(5):
            await write_audit_log(db_session, action="create", target_type="case", target_name=f"case-{i}", user_id=admin.id)
        await db_session.commit()

        response = await client.get("/api/logs?page=1&pageSize=2", headers=headers)
        data = response.json()["data"]
        assert len(data["items"]) == 2
        assert data["total"] >= 5
        assert data["page"] == 1
        assert data["pageSize"] == 2


# ---------------------------------------------------------------------------
# 项目级日志 API
# ---------------------------------------------------------------------------
class TestProjectLogsAPI:

    @pytest.mark.asyncio
    async def test_project_member_can_view_project_logs(self, client, db_session):
        """AC: 项目成员可查看项目级日志"""
        admin = await create_test_user(db_session, username="proj_log_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # 创建项目
        resp = await client.post("/api/projects", headers=headers, json={
            "name": "log-test-project",
            "gitUrl": "git@example.com:log/test.git",
            "scriptBasePath": "/tmp/log-test",
        })
        project_id = resp.json()["data"]["id"]

        # 写入项目级日志
        await write_audit_log(
            db_session, action="create", target_type="branch",
            target_name="default", user_id=admin.id,
            project_id=uuid.UUID(project_id),
        )
        await db_session.commit()

        response = await client.get(f"/api/projects/{project_id}/logs", headers=headers)
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_unbound_user_cannot_view_project_logs(self, client, db_session):
        """AC: 未绑定用户不能查看项目日志"""
        admin = await create_test_user(db_session, username="proj_log_admin2", role="admin")
        user = await create_test_user(db_session, username="proj_log_unbound", role="user")
        admin_headers, _ = make_auth_headers(admin)
        user_headers, _ = make_auth_headers(user)

        resp = await client.post("/api/projects", headers=admin_headers, json={
            "name": "log-test-project-2",
            "gitUrl": "git@example.com:log/test2.git",
            "scriptBasePath": "/tmp/log-test-2",
        })
        project_id = resp.json()["data"]["id"]

        response = await client.get(f"/api/projects/{project_id}/logs", headers=user_headers)
        assert response.status_code == 403
