# Story 1.2: 登录页与 JWT 认证流程

Status: ready-for-dev

## Story

As a 用户,
I want 在登录页输入用户名和密码完成登录，获取 JWT token 并在后续请求中自动携带,
so that 我可以安全地访问平台功能。

## 验收标准 (Acceptance Criteria)

### AC-1: 未登录重定向
**Given** 用户访问平台根路径且未登录
**When** 浏览器加载页面
**Then** 自动重定向到登录页 `/login`

### AC-2: 登录成功
**Given** 用户在登录页输入正确的用户名和密码
**When** 点击登录按钮
**Then**
- 后端 `POST /api/auth/login` 验证通过，返回 JWT token（有效期 8 小时）
- 前端存储 token，后续请求通过 `Authorization: Bearer {token}` 携带
- 登录成功后跳转至首页

### AC-3: 登录失败
**Given** 用户在登录页输入错误的密码
**When** 点击登录按钮
**Then** 页面提示"用户名或密码错误"，不泄露具体哪个字段错误

### AC-4: Token 滑动续期
**Given** 用户已登录且 token 剩余有效期 < 2 小时
**When** 发起任意 API 请求
**Then** 后端在 response header 返回 `X-New-Token`，前端静默替换本地 token

### AC-5: 获取当前用户
**Given** 用户已登录
**When** 调用 `GET /api/auth/me`
**Then** 返回当前用户信息（id, username, role）

### AC-6: 登出
**Given** 用户已登录
**When** 点击登出
**Then** 前端清除 token，跳转至登录页

### AC-7: 未授权拦截
**Given** 未携带 token 或 token 已过期
**When** 访问任何需鉴权的 API
**Then** 返回 401 错误

## 任务拆解 (Tasks / Subtasks)

### Task 1: JWT 工具函数 (AC: #2, #4, #7)

- [ ] 在 `backend/app/core/security.py` 中新增 `create_access_token(payload)` 和 `decode_token(token)` 函数
  - 使用 `joserfc` 库（已在 pyproject.toml 声明），**不用** python-jose
  - 算法：HS256
  - 签名密钥：`settings.secret_key`
  - Payload 包含：`sub`（user_id UUID 字符串）、`role`、`exp`（过期时间戳）、`iat`（签发时间戳）
  - 过期时间：`settings.jwt_expire_hours`（默认 8h）
  - decode 失败抛出 `UnauthorizedError(code="INVALID_TOKEN", message="token 无效或已过期")`

### Task 2: 认证依赖注入 (AC: #4, #5, #7)

- [ ] 实现 `backend/app/deps/auth.py`
  - `get_current_user(request)` — 从 `Authorization: Bearer {token}` 提取 token，decode 后查库返回 User 对象
    - token 缺失 → `UnauthorizedError(code="MISSING_TOKEN", message="未提供认证凭据")`
    - token 无效/过期 → `UnauthorizedError(code="INVALID_TOKEN", message="token 无效或已过期")`
    - 用户不存在或 is_active=False → `UnauthorizedError(code="USER_DISABLED", message="用户已禁用")`
  - `require_role(*roles)` — 装饰器/依赖，检查 user.role 是否在允许列表中，否则 `ForbiddenError`
  - 依赖 `get_session`（from `app.deps.db`）获取数据库 session

### Task 3: 认证服务层 (AC: #2, #3)

- [ ] 实现 `backend/app/services/auth_service.py`
  - `async def authenticate(session, username, password) -> User`
    - 查询 username 对应的 User
    - 用 `verify_password()` 验证密码
    - 验证 is_active=True
    - 任何失败统一返回 `UnauthorizedError(code="LOGIN_FAILED", message="用户名或密码错误")`（不泄露具体原因）

### Task 4: Auth API 路由 (AC: #2, #3, #5, #6, #7)

- [ ] 实现 `backend/app/api/auth.py`，挂载到 `app.include_router(auth_router)`
  - **POST `/api/auth/login`**
    - 请求体：`LoginRequest { username: str, password: str }`
    - 调用 `auth_service.authenticate()`
    - 签发 JWT → 返回 `{ "data": { "token": "...", "user": { id, username, role } } }`
  - **GET `/api/auth/me`**
    - 依赖 `get_current_user`
    - 返回 `{ "data": { "id": "...", "username": "...", "role": "..." } }`
  - **POST `/api/auth/logout`**
    - 纯前端操作，后端返回 `{ "message": "登出成功" }` 即可

### Task 5: Token 滑动续期中间件 (AC: #4)

- [ ] 在 `backend/app/core/middleware.py` 新增 `TokenRefreshMiddleware` 或在现有中间件中嵌入逻辑
  - 对每个带有效 token 的请求，检查 `exp - now < 2h`
  - 条件满足时，签发新 token 放入 response header `X-New-Token`
  - 不阻断正常请求处理

### Task 6: 注册路由到 FastAPI app (AC: #2)

- [ ] 修改 `backend/app/main.py`
  - `from app.api.auth import router as auth_router`
  - `app.include_router(auth_router)`
  - 添加 `TokenRefreshMiddleware`（如果独立实现）

### Task 7: Pydantic Schema 定义 (AC: #2, #5)

- [ ] 在 `backend/app/schemas/` 新增 `auth.py`
  - `LoginRequest(BaseSchema)` — `username: str, password: str`
  - `TokenResponse(BaseSchema)` — `token: str, user: UserResponse`
  - 复用已有的 `UserResponse` from `schemas/user.py`

### Task 8: 前端 Login 页面对接真实 API (AC: #1, #2, #3, #6)

- [ ] 修改 `frontend/src/pages/auth/Login.jsx`
  - 移除 mock 数据导入和 setTimeout 模拟
  - 使用 `api.post('/auth/login', { username, password })` 调用后端
  - 成功后将 token 和 user 信息存入 localStorage
  - 失败时展示后端返回的 `error.message`

- [ ] 确认 `frontend/src/utils/request.js` 已处理：
  - ✅ `Authorization: Bearer {token}` 自动注入
  - ✅ `X-New-Token` 静默替换
  - ✅ 401 清除 token 并跳转 `/login`
  - **注意**：当前 `BASE_URL = '/api/v1'`，但后端路由是 `/api/auth/login`（无 v1），需对齐

## Dev Notes

### 关键约束

1. **JWT 库必须用 joserfc（>=1.0）**，不用 python-jose（已停维）。pyproject.toml 已声明依赖。
2. **错误消息不泄露具体失败原因** — 登录失败统一返回"用户名或密码错误"。
3. **密码从不出现在响应和日志中** — UserResponse schema 不含 password 字段。
4. **所有异常走 AppError 体系** — 不直接抛 HTTPException，用 `UnauthorizedError`、`ForbiddenError` 等。
5. **CamelCase 转换已就绪** — `BaseSchema` 配置了 `alias_generator=to_camel`，`CamelCaseResponse` 处理响应。前端发 camelCase（如 `{ "username": "..." }`），Pydantic 用 `populate_by_name=True` 也接受 snake_case。

### 前端 API Base URL 对齐问题

当前 `frontend/src/utils/request.js` 的 `BASE_URL = '/api/v1'`，而后端路由前缀是 `/api`（无 v1）。有两种处理方式：
- **方案A**：前端 `BASE_URL` 改为 `/api`
- **方案B**：后端路由加 `/api/v1` 前缀

建议 **方案A**，因架构文档的 API 路径均为 `/api/auth/...`，不含 v1。

### 已有基础设施（Story 1.1 产出，直接复用）

| 文件 | 提供能力 |
|------|---------|
| `app/core/security.py` | `hash_password()`, `verify_password()` — 本 Story 在此文件追加 JWT 函数 |
| `app/core/exceptions.py` | `UnauthorizedError(code, message, status_code=401)` — 直接使用 |
| `app/core/middleware.py` | `CamelCaseResponse`, `TraceIdMiddleware` — 已注册 |
| `app/models/user.py` | `User` ORM 模型（id, username, password, role, is_active） |
| `app/schemas/common.py` | `BaseSchema`（camelCase 支持）, `ErrorResponse`, `MessageResponse` |
| `app/schemas/user.py` | `UserResponse`（id, username, role, is_active, created_at, updated_at） |
| `app/deps/db.py` | `get_session()` async session 依赖 |
| `app/config.py` | `settings.secret_key`, `settings.jwt_expire_hours=8`, `settings.bcrypt_cost=12` |
| `tests/conftest.py` | `db_session`, `client` fixtures — 测试直接使用 |
| `tests/factories.py` | `make_user()` — 生成测试用户数据 |

### joserfc 用法参考

```python
from joserfc import jwt
from joserfc.jwk import OctKey

key = OctKey.import_key(settings.secret_key)

# 签发
token = jwt.encode({"alg": "HS256"}, {"sub": str(user.id), "role": user.role, "exp": exp_ts, "iat": now_ts}, key)

# 验证
claims = jwt.decode(token, key)
claims.validate()  # 验证 exp 等标准声明
```

### 项目结构参考

```
backend/app/
├── api/
│   └── auth.py              ← 实现 login / me / logout 路由
├── core/
│   ├── security.py          ← 追加 create_access_token / decode_token
│   └── middleware.py         ← 追加 TokenRefreshMiddleware
├── deps/
│   └── auth.py              ← 实现 get_current_user / require_role
├── schemas/
│   └── auth.py              ← 新建 LoginRequest / TokenResponse
├── services/
│   └── auth_service.py      ← 实现 authenticate()
└── main.py                  ← 注册 auth_router + 中间件
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#认证模式]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Endpoint-Table]
- [Source: _bmad-output/planning-artifacts/architecture.md#joserfc-dependency]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-SEC-001~003]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2]
- [Source: _bmad-output/implementation-artifacts/1-1-backend-scaffold-and-user-table.md]
- [Source: project-context.md]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### Change Log

### File List
