# Story 1.3: 用户 CRUD 管理

Status: ready-for-dev

## Story

As a 系统管理员,
I want 创建、编辑、删除用户账号，管理用户的系统角色和激活状态,
so that 团队成员可以使用平台。

## 验收标准 (Acceptance Criteria)

### AC-1: 用户列表
**Given** 系统管理员已登录
**When** 访问用户管理页面
**Then** 展示所有用户列表，包含用户名、角色、状态、创建时间

### AC-2: 创建用户
**Given** 系统管理员在用户管理页面点击"新建用户"
**When** 填写用户名（唯一）、密码、系统角色（admin/user），点击保存
**Then**
- `POST /api/users` 创建成功，密码 bcrypt 加密存储
- 用户名重复时返回 409 错误

### AC-3: 编辑用户
**Given** 系统管理员编辑某用户
**When** 修改角色或激活状态后保存
**Then** `PUT /api/users/{id}` 更新成功，变更立即生效

### AC-4: 删除用户
**Given** 系统管理员删除某用户
**When** 确认删除操作
**Then** `DELETE /api/users/{id}` 执行成功（注：项目绑定功能在 Story 1.5 实现，当前直接删除即可）

### AC-5: 权限拦截
**Given** 非系统管理员用户已登录
**When** 尝试访问用户管理 API
**Then** 返回 403 错误

## 任务拆解 (Tasks / Subtasks)

### Task 1: 用户 Schema 扩展 (AC: #1, #2, #3)

- [ ] 在 `backend/app/schemas/user.py` 中新增：
  - `CreateUserRequest(BaseSchema)` — `username: str, password: str, role: str = "user"`
    - username: 长度 2-50，仅允许字母数字下划线
    - password: 长度 6-128
    - role: 只能是 "admin" 或 "user"
  - `UpdateUserRequest(BaseSchema)` — `role: str | None = None, is_active: bool | None = None`
    - 所有字段可选，至少传一个
    - role 同上校验

### Task 2: 用户服务层 (AC: #1, #2, #3, #4)

- [ ] 新建 `backend/app/services/user_service.py`，实现：
  - `async def list_users(session) -> list[User]` — 查询所有用户，按 created_at 降序
  - `async def create_user(session, data) -> User` — 创建用户，密码 bcrypt 加密
    - 用户名重复 → `ConflictError(code="USERNAME_EXISTS", message="用户名已存在")`
  - `async def update_user(session, user_id, data) -> User` — 更新角色/状态
    - 用户不存在 → `NotFoundError(code="USER_NOT_FOUND", message="用户不存在")`
  - `async def delete_user(session, user_id) -> None` — 删除用户
    - 用户不存在 → `NotFoundError`

### Task 3: 用户 API 路由 (AC: #1, #2, #3, #4, #5)

- [ ] 新建 `backend/app/api/users.py`，挂载到 app：
  - **GET `/api/users`** — 用户列表，依赖 `require_role("admin")`
    - 返回 `{ "data": [ UserResponse, ... ] }`
  - **POST `/api/users`** — 创建用户，依赖 `require_role("admin")`
    - 请求体：`CreateUserRequest`
    - 返回 201 + `{ "data": UserResponse }`
  - **PUT `/api/users/{user_id}`** — 更新用户，依赖 `require_role("admin")`
    - 请求体：`UpdateUserRequest`
    - 返回 `{ "data": UserResponse }`
  - **DELETE `/api/users/{user_id}`** — 删除用户，依赖 `require_role("admin")`
    - 返回 `{ "message": "删除成功" }`

### Task 4: 注册路由到 main.py (AC: #1)

- [ ] 在 `backend/app/main.py` 中添加 `app.include_router(users_router)`

### Task 5: 冒烟验证（Story 1.2 复盘教训）

- [ ] **每完成一个 Task 立即验证**，不攒到最后：
  - Task 1 完成后：`python3 -c "from app.schemas.user import CreateUserRequest"` 确认导入正常
  - Task 2 完成后：跑一个最小测试确认 service 函数签名正确
  - Task 3 完成后：跑 `pytest tests/` 确认无回归

## Dev Notes

### 关键约束

1. **所有端点都需要 admin 权限** — 使用 `Depends(require_role("admin"))`，非 admin 返回 403
2. **密码不出现在任何响应中** — `UserResponse` 不含 password 字段，已在 Story 1.1 确立
3. **用户名唯一约束** — 数据库层 `UNIQUE` + 服务层捕获 `IntegrityError` 转为 `ConflictError`
4. **role 只允许 "admin" / "user"** — 在 Pydantic schema 中用 `Literal["admin", "user"]` 校验
5. **删除策略** — 当前直接硬删除。项目成员绑定在 Story 1.5 实现后才有级联问题，当前无需处理
6. **不要自己修改密码的逻辑** — 修改密码功能不在此 Story 范围，UpdateUserRequest 不含 password 字段

### 已有基础设施（直接复用）

| 文件 | 提供能力 |
|------|---------|
| `app/core/security.py` | `hash_password()` — 创建用户时加密密码 |
| `app/core/exceptions.py` | `ConflictError(409)`, `NotFoundError(404)`, `ForbiddenError(403)` |
| `app/deps/auth.py` | `require_role("admin")` — 端点权限控制 |
| `app/deps/db.py` | `get_db()` — 数据库 session 依赖 |
| `app/schemas/common.py` | `BaseSchema`(camelCase), `MessageResponse` |
| `app/schemas/user.py` | `UserResponse` — 已有，本 Story 扩展 |
| `app/models/user.py` | `User` ORM 模型 |

### 项目结构参考

```
backend/app/
├── api/
│   ├── auth.py              # 已有（Story 1.2）
│   └── users.py             ← 新建：用户 CRUD 路由
├── schemas/
│   └── user.py              ← 扩展：CreateUserRequest / UpdateUserRequest
├── services/
│   ├── auth_service.py      # 已有（Story 1.2）
│   └── user_service.py      ← 新建：用户 CRUD 业务逻辑
└── main.py                  ← 注册 users_router
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Users-Table]
- [Source: _bmad-output/planning-artifacts/prd.md#角色权限表]
- [Source: _bmad-output/implementation-artifacts/1-2-login-jwt-auth.md]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### Change Log

### File List
