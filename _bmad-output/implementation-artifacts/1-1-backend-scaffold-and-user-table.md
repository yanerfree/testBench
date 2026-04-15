# Story 1.1: 后端项目脚手架与用户表

Status: ready-for-dev

## Story

As a 开发团队,
I want 搭建 FastAPI 后端项目骨架，包含数据库连接、用户表和核心基础设施,
so that 后续所有 Story 都有统一的技术基础可以构建。

## 验收标准 (Acceptance Criteria)

1. FastAPI 应用启动成功，`GET /api/healthz` 返回 `{"status": "ok"}`
2. 项目结构符合架构文档（app/api, app/models, app/schemas, app/services, app/engine, app/core, app/deps）
3. PostgreSQL 数据库连接成功（asyncpg + SQLAlchemy 2.0 async）
4. Alembic 迁移配置完成，首个 migration 创建 `users` 表（字段：id UUID, username, password, role, is_active, created_at, updated_at）
5. `alembic upgrade head` 执行成功
6. 初始管理员账号通过 seed 脚本创建（username=admin, role=admin）
7. 密码使用 bcrypt (cost >= 10) 加密存储，明文不落库不打印
8. 统一异常体系（AppError 基类 + NotFoundError / ForbiddenError / ConflictError）已就绪
9. 全局 exception handler 统一输出 `{"error": {"code": ..., "message": ..., "detail": ...}}` 格式
10. CamelCaseResponse 已配置，API 响应自动 snake_case -> camelCase 转换
11. CORS 中间件 + trace_id 中间件已配置
12. pyproject.toml 包含所有核心依赖及版本约束

## 任务拆解 (Tasks/Subtasks)

### Task 1: 初始化项目骨架 [AC-2, AC-12]

- [ ] 在项目根目录创建 `backend/` 目录及完整子目录结构
- [ ] 创建 `backend/pyproject.toml`，包含所有核心依赖（见依赖清单）
- [ ] 创建 `backend/.env.example`，列出所有环境变量
- [ ] 在每个 Python 包目录下创建 `__init__.py`
- [ ] 创建 `backend/app/config.py` 配置管理模块

### Task 2: 配置数据库连接 [AC-3]

- [ ] 创建 `backend/app/deps/db.py`，实现 async session 工厂和 `get_db` 依赖
- [ ] 使用 `create_async_engine` + `async_sessionmaker`（asyncpg 驱动）
- [ ] 配置连接池参数（pool_size, max_overflow）

### Task 3: 配置 Alembic 迁移 [AC-4, AC-5]

- [ ] 创建 `backend/alembic.ini`
- [ ] 创建 `backend/alembic/env.py`（async migration 配置）
- [ ] 创建首个 migration：`users` 表
- [ ] 验证 `alembic upgrade head` 和 `alembic downgrade -1` 均可执行

### Task 4: 创建 Users 模型和 Schema [AC-4]

- [ ] 创建 `backend/app/models/user.py`（SQLAlchemy ORM 模型）
- [ ] 创建 `backend/app/schemas/user.py`（Pydantic schema）
- [ ] 创建 `backend/app/schemas/common.py`（通用 BaseSchema、分页、错误响应）

### Task 5: 实现核心基础设施 — 异常体系 [AC-8, AC-9]

- [ ] 创建 `backend/app/core/exceptions.py`（AppError + 子类）
- [ ] 在 `main.py` 注册全局 exception handler

### Task 6: 实现核心基础设施 — CamelCaseResponse [AC-10]

- [ ] 在 `backend/app/core/middleware.py` 实现 `CamelCaseResponse`
- [ ] 实现 `to_camel_case` 递归转换函数
- [ ] 配置 FastAPI `default_response_class=CamelCaseResponse`

### Task 7: 实现核心基础设施 — 中间件 [AC-11]

- [ ] 实现 trace_id 中间件（每个请求生成唯一 trace_id，注入 response header）
- [ ] 配置 CORS 中间件（开发环境允许 localhost:5173）

### Task 8: 实现 Health Check [AC-1]

- [ ] 创建 `backend/app/core/health.py`
- [ ] 注册路由 `GET /api/healthz` 返回 `{"status": "ok"}`

### Task 9: 实现 bcrypt 密码工具 [AC-7]

- [ ] 在 `backend/app/core/security.py` 实现 `hash_password` 和 `verify_password`
- [ ] bcrypt cost factor >= 10
- [ ] 确保明文密码不出现在日志中

### Task 10: 创建 Seed 脚本 [AC-6]

- [ ] 创建 `backend/app/seed.py`（或 `backend/seed.py`）
- [ ] 实现初始管理员创建逻辑（幂等：已存在则跳过）
- [ ] 默认 username=admin, password 从环境变量读取（ADMIN_DEFAULT_PASSWORD），无则使用安全默认值

### Task 11: 创建 FastAPI 入口 [AC-1, AC-9, AC-10, AC-11]

- [ ] 创建 `backend/app/main.py`，组装所有中间件、异常处理器、路由
- [ ] 验证 `uvicorn app.main:app --reload` 可正常启动

## 开发指南 (Dev Notes)

### 技术栈与版本

| 技术 | 版本要求 | 用途 |
|------|---------|------|
| Python | >= 3.11 | 运行时 |
| FastAPI | >= 0.115 | Web 框架 |
| Uvicorn | >= 0.30 | ASGI 服务器 |
| SQLAlchemy | >= 2.0 | ORM（async 模式） |
| Alembic | >= 1.13 | 数据库迁移 |
| asyncpg | >= 0.29 | PostgreSQL 异步驱动 |
| Pydantic | >= 2.0 | 数据校验 |
| joserfc | >= 1.0 | JWT 签发/验证（**不要用 python-jose**） |
| bcrypt | >= 4.0, < 4.1 | 密码加密（pin 版本避免 passlib 兼容问题） |
| arq | >= 0.26 | 任务队列（本 Story 只声明依赖，不启用） |
| redis | >= 5.0 | 缓存/队列后端（本 Story 只声明依赖） |
| httpx | >= 0.27 | HTTP 客户端（本 Story 只声明依赖） |
| tenacity | >= 8.2 | 重试机制（本 Story 只声明依赖） |
| openpyxl | >= 3.1 | Excel 导出（本 Story 只声明依赖） |
| jinja2 | >= 3.1 | HTML 模板（本 Story 只声明依赖） |
| filelock | >= 3.13 | 文件锁（本 Story 只声明依赖） |

### 项目结构

在 `testBench/` 根目录下创建以下完整结构：

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI 应用入口
│   ├── config.py                  # 配置管理（Pydantic Settings）
│   │
│   ├── deps/                      # 依赖注入
│   │   ├── __init__.py
│   │   ├── db.py                  # get_db session
│   │   ├── auth.py                # get_current_user（本 Story 只创建占位）
│   │   └── worker.py              # get_arq_pool（本 Story 只创建占位）
│   │
│   ├── api/                       # API 路由层
│   │   ├── __init__.py
│   │   └── auth.py                # （本 Story 只创建占位空文件）
│   │
│   ├── models/                    # SQLAlchemy ORM 模型
│   │   ├── __init__.py
│   │   └── user.py
│   │
│   ├── schemas/                   # Pydantic 请求/响应模型
│   │   ├── __init__.py
│   │   ├── common.py              # 通用 BaseSchema、分页、错误响应
│   │   └── user.py
│   │
│   ├── services/                  # 业务逻辑层
│   │   ├── __init__.py
│   │   └── auth_service.py        # （本 Story 只创建占位空文件）
│   │
│   ├── engine/                    # 执行引擎
│   │   └── __init__.py
│   │
│   └── core/                      # 横切关注点
│       ├── __init__.py
│       ├── security.py            # bcrypt 密码工具 + JWT 占位
│       ├── exceptions.py          # 统一异常体系
│       ├── health.py              # /healthz 端点
│       └── middleware.py          # CamelCaseResponse + trace_id + CORS
│
├── alembic/                       # 数据库迁移
│   ├── env.py                     # async migration 配置
│   └── versions/
│       └── 001_create_users_table.py
│
├── seed.py                        # 初始管理员 seed 脚本
├── pyproject.toml
├── alembic.ini
└── .env.example
```

> **注意：** 未来 Story 需要的文件（如 api/projects.py, models/project.py 等）在本 Story 中**不创建**。只创建本 Story 验收标准要求的文件和必要的占位文件。

### 数据库 Schema

#### users 表

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(50) UNIQUE NOT NULL,
    password    VARCHAR(128) NOT NULL,
    role        VARCHAR(10) NOT NULL DEFAULT 'user',  -- admin / user
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键，PostgreSQL `gen_random_uuid()` 生成 |
| username | VARCHAR(50) | 用户名，全局唯一 |
| password | VARCHAR(128) | bcrypt 哈希值（60 字符，留 128 余量） |
| role | VARCHAR(10) | 系统级角色：`admin` 或 `user` |
| is_active | BOOLEAN | 是否启用，默认 true |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

**角色体系说明：** 系统级只有两个角色 — `admin`（全局权限）和 `user`（需绑定项目后才能操作）。项目级角色（project_admin / developer / tester / guest）在后续 Story 的 `project_members` 表中实现。

### API 规范

#### 响应格式

所有 API 统一使用以下格式：

```json
// 成功 — 单对象
{ "data": { "id": "xxx", "name": "..." } }

// 成功 — 列表（分页）
{
  "data": [ ... ],
  "pagination": { "page": 1, "pageSize": 20, "total": 342 }
}

// 成功 — 无返回值操作
{ "message": "操作成功" }

// 错误
{
  "error": {
    "code": "CASE_NOT_FOUND",
    "message": "用例不存在",
    "detail": "case_id=xxx not found"
  }
}
```

#### HTTP 状态码

| 码 | 场景 |
|----|------|
| 200 | 查询/更新成功 |
| 201 | 创建成功 |
| 400 | 参数校验失败 |
| 401 | 未登录 / token 过期 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突（重名/状态不允许） |
| 422 | 业务规则校验失败 |
| 500 | 服务端异常 |

#### API 路径前缀

架构文档命名规范指定 `/api/v1/` 前缀（如 `/api/v1/projects/{projectId}/cases`）。但 healthz 端点为基础设施端点，使用 `/api/healthz`（无版本号）。后续业务端点（Story 1.2+）统一使用 `/api/v1/` 前缀。

**本 Story 只需实现：**
- `GET /api/healthz` — 健康检查（无版本前缀）

### 核心基础设施代码模式

#### 1. 统一异常体系 — `app/core/exceptions.py`

```python
from fastapi import Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse


class AppError(Exception):
    """应用异常基类"""
    def __init__(self, code: str, message: str, status_code: int = 400, detail: str | None = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.detail = detail


class NotFoundError(AppError):
    """资源不存在"""
    def __init__(self, code: str = "NOT_FOUND", message: str = "资源不存在", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=404, detail=detail)


class ForbiddenError(AppError):
    """无权限"""
    def __init__(self, code: str = "FORBIDDEN", message: str = "无权限", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=403, detail=detail)


class ConflictError(AppError):
    """冲突"""
    def __init__(self, code: str = "CONFLICT", message: str = "资源冲突", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=409, detail=detail)


class UnauthorizedError(AppError):
    """未认证"""
    def __init__(self, code: str = "UNAUTHORIZED", message: str = "未登录或 token 已过期", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=401, detail=detail)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """AppError 全局处理器"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            }
        },
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """FastAPI HTTPException 全局处理器（兜底，统一格式）"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail if isinstance(exc.detail, str) else "请求错误",
                "detail": None,
            }
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """未捕获异常兜底（生产环境不暴露堆栈）"""
    # TODO: 接入日志系统记录堆栈
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "服务内部错误",
                "detail": None,
            }
        },
    )
```

**强制规则：** 禁止在业务代码中直接 `raise HTTPException(400, "xxx")`。所有业务错误必须使用 `AppError` 或其子类。

#### 2. CamelCaseResponse + trace_id — `app/core/middleware.py`

```python
import re
import uuid
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def _to_camel(name: str) -> str:
    """snake_case -> camelCase"""
    components = name.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


def to_camel_case(data: Any) -> Any:
    """递归将 dict key 从 snake_case 转为 camelCase"""
    if isinstance(data, dict):
        return {_to_camel(k): to_camel_case(v) for k, v in data.items()}
    if isinstance(data, list):
        return [to_camel_case(item) for item in data]
    return data


class CamelCaseResponse(JSONResponse):
    """自动将响应 body 中的 snake_case key 转为 camelCase"""
    def render(self, content: Any) -> bytes:
        return super().render(to_camel_case(content))


class TraceIdMiddleware(BaseHTTPMiddleware):
    """为每个请求生成唯一 trace_id，注入到 request.state 和 response header"""
    async def dispatch(self, request: Request, call_next):
        trace_id = request.headers.get("X-Trace-Id") or str(uuid.uuid4())
        request.state.trace_id = trace_id
        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        return response
```

#### 3. BaseSchema（请求体 camelCase 反序列化） — `app/schemas/common.py`

```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """所有 schema 的基类，支持 camelCase 请求体自动转 snake_case"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # 允许 snake_case 构造
    )
```

#### 4. 配置管理 — `app/config.py`

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 数据库
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/testbench"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # 安全
    secret_key: str = "change-me-in-production"
    jwt_expire_hours: int = 8
    bcrypt_cost: int = 12  # >= 10

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # Admin seed
    admin_default_password: str = "admin123"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

#### 5. 数据库连接 — `app/deps/db.py`

```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    echo=False,
)

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

#### 6. User ORM 模型 — `app/models/user.py`

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """ORM 基类，所有模型继承此类"""
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="user", server_default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

> **注意：** `Base` 声明在 `models/user.py` 中，后续随模型增多可抽取到 `models/base.py`。Alembic 的 `env.py` 需要导入此 `Base.metadata`。

#### 7. bcrypt 密码工具 — `app/core/security.py`

```python
import bcrypt

from app.config import settings


def hash_password(plain_password: str) -> str:
    """对明文密码进行 bcrypt 哈希，cost factor 取自配置（>= 10）"""
    salt = bcrypt.gensalt(rounds=settings.bcrypt_cost)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证明文密码与哈希值是否匹配"""
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
```

> **重要：** 使用 `bcrypt` 库直接调用，**不要用 passlib**。bcrypt 版本 pin 在 `>=4.0,<4.1` 以避免 passlib 兼容性问题。JWT 相关功能（joserfc）在 Story 1.2 实现，本 Story 只保留占位注释。

#### 8. Health Check — `app/core/health.py`

```python
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/healthz")
async def healthz():
    return {"status": "ok"}
```

#### 9. FastAPI 入口 — `app/main.py`

```python
from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.exceptions import AppError, app_error_handler, http_exception_handler, unhandled_exception_handler
from app.core.health import router as health_router
from app.core.middleware import CamelCaseResponse, TraceIdMiddleware

app = FastAPI(
    title="测试管理平台 API",
    default_response_class=CamelCaseResponse,
)

# --- 中间件（注册顺序：后注册先执行） ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TraceIdMiddleware)

# --- 异常处理器 ---
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# --- 路由 ---
app.include_router(health_router)
```

#### 10. Alembic 配置 — `alembic/env.py`

```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.models.user import Base  # 导入 Base 以获取 metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式"""
    url = settings.database_url
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """在线模式（async）"""
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

`alembic.ini` 中的 `sqlalchemy.url` 留空，由 `env.py` 从 `settings` 读取。

#### 11. Seed 脚本 — `backend/seed.py`

```python
"""初始管理员 seed 脚本 — 幂等执行"""
import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import hash_password
from app.deps.db import async_session_factory
from app.models.user import User


async def seed_admin():
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        existing = result.scalar_one_or_none()
        if existing:
            print("Admin user already exists, skipping.")
            return
        admin = User(
            username="admin",
            password=hash_password(settings.admin_default_password),
            role="admin",
            is_active=True,
        )
        session.add(admin)
        await session.commit()
        print("Admin user created successfully.")


if __name__ == "__main__":
    asyncio.run(seed_admin())
```

运行方式：
```bash
cd backend
python -m seed
```

### 命名规范

#### 数据库命名

| 维度 | 规则 | 示例 |
|------|------|------|
| 表名 | 小写复数 snake_case | `users`, `test_reports`, `plan_cases` |
| 列名 | 小写 snake_case | `created_at`, `pass_rate` |
| 外键 | `{关联表单数}_id` | `project_id`, `user_id` |
| 索引 | `idx_{表名}_{列名}` | `idx_cases_project_module` |
| JSONB 内部字段 | **snake_case** | `{"status_code": 200, "request_body": {...}}` |

#### 后端 Python 命名

| 维度 | 规则 | 示例 |
|------|------|------|
| 文件名 | snake_case | `case_service.py` |
| 类名 | PascalCase | `CaseService`, `TestReport` |
| 函数/方法 | snake_case | `get_cases_by_project()` |
| 变量 | snake_case | `plan_id`, `commit_sha` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Pydantic schema | PascalCase + 后缀 | `CaseCreateRequest`, `ReportResponse` |
| SQLAlchemy model | PascalCase 单数 | `User`, `TestReport` |

#### API 命名

| 维度 | 规则 | 示例 |
|------|------|------|
| 路径 | 小写复数 kebab-case | `/api/v1/projects/{projectId}/cases` |
| 路径参数 | camelCase | `{projectId}`, `{scenarioId}` |
| 查询参数 | camelCase | `?pageSize=20&sortBy=createdAt` |
| 请求/响应 body | camelCase（由 CamelCaseResponse 自动转换） | `{ "passRate": 87.96 }` |

### 依赖清单

`backend/pyproject.toml` 内容：

```toml
[project]
name = "testbench-backend"
version = "0.1.0"
description = "测试管理平台后端"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn>=0.30",
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "asyncpg>=0.29",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "joserfc>=1.0",
    "bcrypt>=4.0,<4.1",
    "arq>=0.26",
    "redis>=5.0",
    "httpx>=0.27",
    "tenacity>=8.2",
    "openpyxl>=3.1",
    "jinja2>=3.1",
    "filelock>=3.13",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "httpx",
]
```

> **注意：** `pydantic-settings` 需要单独声明，它从 Pydantic v2 起是独立包。

### 关键实现细节

1. **bcrypt cost >= 10：** 配置默认值设为 12，最低不可低于 10。直接用 `bcrypt` 库，**禁止使用 passlib**。

2. **JWT 使用 joserfc：** 本 Story 只声明依赖，不实现 JWT 逻辑。**绝对不要引入 python-jose**（已停维）。JWT 实现在 Story 1.2 中完成。

3. **asyncpg 异步数据库：** 所有数据库操作必须 async。连接字符串格式：`postgresql+asyncpg://user:pass@host:port/dbname`。禁止使用 `psycopg2` 同步驱动。

4. **Alembic async migration：** `env.py` 必须使用 `create_async_engine` + `asyncio.run()`。参考上方代码模式。每个 migration 必须有 `downgrade` 函数（可回滚）。

5. **Admin seed 幂等：** seed 脚本必须检查 admin 用户是否已存在，已存在则跳过，不报错。密码从环境变量 `ADMIN_DEFAULT_PASSWORD` 读取。**明文密码不可出现在日志输出中。**

6. **CamelCaseResponse：** 配置为 FastAPI 的 `default_response_class`，所有路由自动生效。业务代码全程使用 snake_case，无需手动转换。

7. **trace_id 中间件：** 优先读取请求头 `X-Trace-Id`（支持上游传递），不存在则生成 UUID。写入 `request.state.trace_id` 供日志/审计使用，同时回写到响应头。

8. **CORS 配置：** 开发环境允许 `http://localhost:5173`（Vite 默认端口）。`allow_origins` 从 `settings.cors_origins` 读取，生产环境通过环境变量配置。

9. **全局 exception handler 覆盖范围：** 必须注册三个 handler：
   - `AppError` — 业务异常
   - `HTTPException` — FastAPI 内置异常（统一格式）
   - `Exception` — 未捕获异常兜底（返回 500，不暴露堆栈）

10. **`.env.example` 文件内容：**

```bash
# 数据库
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/testbench
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20

# 安全
SECRET_KEY=change-me-in-production
JWT_EXPIRE_HOURS=8
BCRYPT_COST=12

# CORS
CORS_ORIGINS=["http://localhost:5173"]

# Admin
ADMIN_DEFAULT_PASSWORD=admin123
```

### 项目结构说明

| 文件 | 职责 |
|------|------|
| `app/main.py` | FastAPI 应用入口，组装中间件、异常处理器、路由 |
| `app/config.py` | 基于 pydantic-settings 的配置管理，从 .env 读取 |
| `app/deps/db.py` | 异步数据库引擎和 session 工厂，提供 `get_db` 依赖注入 |
| `app/deps/auth.py` | 认证依赖注入占位（Story 1.2 实现） |
| `app/deps/worker.py` | arq Worker 依赖注入占位（后续 Story 实现） |
| `app/models/user.py` | User ORM 模型 + DeclarativeBase 基类 |
| `app/schemas/common.py` | BaseSchema（camelCase alias）、分页参数、错误响应 schema |
| `app/schemas/user.py` | User 相关 Pydantic schema |
| `app/core/exceptions.py` | AppError 基类 + NotFoundError / ForbiddenError / ConflictError / UnauthorizedError + 全局 handler |
| `app/core/middleware.py` | CamelCaseResponse（JSONResponse 子类）+ TraceIdMiddleware + to_camel_case 工具函数 |
| `app/core/health.py` | `GET /api/healthz` 端点 |
| `app/core/security.py` | `hash_password` / `verify_password`（bcrypt） |
| `alembic/env.py` | async Alembic 配置，从 app.config 读取数据库 URL |
| `alembic/versions/001_*.py` | 首个 migration — 创建 users 表 |
| `seed.py` | 初始管理员创建脚本（幂等） |
| `pyproject.toml` | 项目元信息和依赖声明 |
| `alembic.ini` | Alembic 配置文件 |
| `.env.example` | 环境变量示例文件 |

### 参考文档

| 文档 | 路径 | 相关行号 |
|------|------|---------|
| Epic/Story 定义 | `_bmad-output/planning-artifacts/epics.md` | 212-236 |
| 后端项目结构 | `_bmad-output/planning-artifacts/architecture.md` | 145-229 |
| 核心依赖 | `_bmad-output/planning-artifacts/architecture.md` | 234-253 |
| Users 表 Schema | `_bmad-output/planning-artifacts/architecture.md` | 474-486 |
| 角色体系 | `_bmad-output/planning-artifacts/architecture.md` | 465-470 |
| 命名规范 | `_bmad-output/planning-artifacts/architecture.md` | 975-1019 |
| camelCase 转换策略 | `_bmad-output/planning-artifacts/architecture.md` | 1021-1041 |
| API 响应格式 | `_bmad-output/planning-artifacts/architecture.md` | 1043-1103 |
| 认证模式 | `_bmad-output/planning-artifacts/architecture.md` | 1113-1120 |
| 错误处理 | `_bmad-output/planning-artifacts/architecture.md` | 1122-1140 |
| Alembic 迁移规范 | `_bmad-output/planning-artifacts/architecture.md` | 1173-1180 |
| 用户角色定义 | `_bmad-output/planning-artifacts/prd.md` | 84-108 |

## Dev Agent Record

### Agent Model Used
(to be filled)

### Completion Notes List
(to be filled)

### Change Log
(to be filled)

### File List
(to be filled)
