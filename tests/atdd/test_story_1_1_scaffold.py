"""
ATDD 验收测试 — Story 1.1: 后端项目脚手架与用户表
TDD Red Phase: 所有测试标记 xfail，实现后移除标记进入 Green Phase

覆盖验收标准:
- GET /api/healthz → {"status": "ok"}
- PostgreSQL 连接成功
- users 表字段完整
- 初始 admin 种子数据
- bcrypt 密码加密 cost >= 10
- 统一异常体系 (NotFoundError/ForbiddenError/ConflictError)
- CamelCase 响应转换
- CORS 中间件 + trace_id 中间件
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers


# ---------------------------------------------------------------------------
# 1.1-API-001: GET /api/healthz 返回 {"status": "ok"}
# Priority: P0
# ---------------------------------------------------------------------------
class TestHealthzEndpoint:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_healthz_returns_ok(self, client):
        """AC: FastAPI 应用启动成功，GET /api/healthz 返回 {"status": "ok"}"""
        # When: 访问健康检查端点
        response = await client.get("/api/healthz")

        # Then: 返回 200 和 status ok
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


# ---------------------------------------------------------------------------
# 1.1-INT-001: PostgreSQL 数据库连接成功
# Priority: P0
# ---------------------------------------------------------------------------
class TestDatabaseConnection:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_database_connection(self, db_session):
        """AC: PostgreSQL 数据库连接成功 (asyncpg)"""
        # When: 执行简单查询
        from sqlalchemy import text
        result = await db_session.execute(text("SELECT 1"))

        # Then: 返回结果
        assert result.scalar() == 1


# ---------------------------------------------------------------------------
# 1.1-INT-002: users 表字段完整
# Priority: P1
# ---------------------------------------------------------------------------
class TestUsersTableSchema:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_users_table_has_required_columns(self, db_session):
        """AC: users 表字段: id, username, password, role, is_active, created_at, updated_at"""
        from sqlalchemy import text, inspect

        # When: 查询 users 表列信息
        conn = await db_session.connection()
        raw_conn = await conn.get_raw_connection()
        # 使用 asyncpg 查询
        columns = await raw_conn.fetch(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
        )
        column_names = {row["column_name"] for row in columns}

        # Then: 包含所有必需字段
        expected_columns = {"id", "username", "password", "role", "is_active", "created_at", "updated_at"}
        assert expected_columns.issubset(column_names), f"缺少字段: {expected_columns - column_names}"


# ---------------------------------------------------------------------------
# 1.1-INT-003: 初始 admin 种子数据
# Priority: P1
# ---------------------------------------------------------------------------
class TestAdminSeedData:

    @pytest.mark.integration
    @pytest.mark.asyncio
    async def test_admin_seed_exists(self, db_session):
        """AC: 初始管理员账号通过 seed 脚本创建 (username=admin, role=admin)"""
        from sqlalchemy import select
        from app.models.user import User

        # When: 查询 admin 用户
        result = await db_session.execute(
            select(User).where(User.username == "admin")
        )
        admin = result.scalar_one_or_none()

        # Then: admin 用户存在且角色正确
        assert admin is not None, "admin 种子用户不存在"
        assert admin.role == "admin"
        assert admin.is_active is True


# ---------------------------------------------------------------------------
# 1.1-UNIT-001: bcrypt 密码加密 cost >= 10
# Priority: P0
# ---------------------------------------------------------------------------
class TestBcryptPasswordHashing:

    @pytest.mark.unit
    def test_password_hash_is_bcrypt(self):
        """AC: 密码使用 bcrypt 加密存储"""
        from app.core.security import hash_password

        # When: 对密码进行加密
        hashed = hash_password("TestPassword@123")

        # Then: 结果是 bcrypt 格式 ($2b$ 前缀)
        assert hashed.startswith(("$2b$", "$2a$")), f"不是 bcrypt 格式: {hashed[:10]}"

    @pytest.mark.unit
    def test_password_hash_cost_at_least_10(self):
        """AC: bcrypt cost >= 10"""
        from app.core.security import hash_password

        # When: 加密密码
        hashed = hash_password("TestPassword@123")

        # Then: cost factor >= 10 (从 hash 字符串中提取)
        cost = int(hashed.split("$")[2])
        assert cost >= 10, f"bcrypt cost {cost} < 10"

    @pytest.mark.unit
    def test_plaintext_password_not_in_hash(self):
        """AC: 明文不落库"""
        from app.core.security import hash_password

        password = "TestPassword@123"
        hashed = hash_password(password)

        assert password not in hashed


# ---------------------------------------------------------------------------
# 1.1-API-002~004: 统一异常体系
# Priority: P1
# ---------------------------------------------------------------------------
class TestUnifiedExceptionFormat:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_not_found_error_format(self, client, db_session):
        """AC: NotFoundError → 404 {"error": {"code": ..., "message": ..., "detail": ...}}"""
        admin = await create_test_user(db_session, username="exc_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 访问不存在的资源
        response = await client.get("/api/users/00000000-0000-0000-0000-000000000000", headers=headers)

        # Then: 404 统一格式
        assert response.status_code == 404
        body = response.json()
        assert "error" in body
        assert "code" in body["error"]
        assert "message" in body["error"]

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_forbidden_error_format(self, client, db_session):
        """AC: ForbiddenError → 403 统一格式"""
        user = await create_test_user(db_session, username="exc_user", role="user")
        headers, _ = make_auth_headers(user)

        # When: 非 admin 访问用户管理
        response = await client.get("/api/users", headers=headers)

        # Then: 403 统一格式
        assert response.status_code == 403
        body = response.json()
        assert "error" in body

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_conflict_error_format(self, client, db_session):
        """AC: ConflictError → 409 统一格式"""
        admin = await create_test_user(db_session, username="exc_admin2", role="admin")
        headers, _ = make_auth_headers(admin)

        # Given: 创建一个用户
        await client.post("/api/users", headers=headers, json={
            "username": "duplicate_user",
            "password": "Test@123456",
            "role": "user",
        })

        # When: 重复创建同名用户
        response = await client.post("/api/users", headers=headers, json={
            "username": "duplicate_user",
            "password": "Test@123456",
            "role": "user",
        })

        # Then: 409 统一格式
        assert response.status_code == 409
        body = response.json()
        assert "error" in body


# ---------------------------------------------------------------------------
# 1.1-API-005: CamelCase 响应转换
# Priority: P1
# ---------------------------------------------------------------------------
class TestCamelCaseResponse:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_response_uses_camel_case(self, client, db_session):
        """AC: API 响应自动 snake_case → camelCase 转换"""
        admin = await create_test_user(db_session, username="camel_admin", role="admin")
        headers, _ = make_auth_headers(admin)

        # When: 获取用户信息
        response = await client.get("/api/auth/me", headers=headers)

        # Then: 响应字段使用 camelCase
        data = response.json()
        # 检查是否使用了 camelCase (如 isActive 而非 is_active)
        user_data = data.get("data", data)
        # 不应该有 snake_case 的 key
        all_keys = str(user_data)
        assert "is_active" not in all_keys or "isActive" in all_keys


# ---------------------------------------------------------------------------
# 1.1-API-006: CORS 中间件
# Priority: P2
# ---------------------------------------------------------------------------
class TestCorsMiddleware:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_cors_preflight_response(self, client):
        """AC: CORS 中间件已配置，OPTIONS 预检请求正常"""
        # When: 发送 OPTIONS 预检请求
        response = await client.options(
            "/api/healthz",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

        # Then: CORS headers 存在
        assert response.status_code in (200, 204)
        assert "access-control-allow-origin" in response.headers


# ---------------------------------------------------------------------------
# 1.1-API-007: trace_id 中间件
# Priority: P2
# ---------------------------------------------------------------------------
class TestTraceIdMiddleware:

    @pytest.mark.api
    @pytest.mark.asyncio
    async def test_response_contains_trace_id(self, client):
        """AC: 响应头包含 X-Trace-Id"""
        # When: 发送任意请求
        response = await client.get("/api/healthz")

        # Then: 响应头包含 trace_id
        assert "x-trace-id" in response.headers or "X-Trace-Id" in response.headers
