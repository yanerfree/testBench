# Story 1.4: 项目 CRUD

Status: ready-for-dev

## Story

As a 系统管理员,
I want 创建项目（含 Git 仓库地址和脚本基础路径），并在创建时自动生成默认分支配置,
so that 团队可以开始接入测试管理。

## 验收标准 (Acceptance Criteria)

### AC-1: 创建项目
**Given** 系统管理员已登录
**When** 创建项目，填写项目名称、Git 仓库地址、脚本基础路径
**Then**
- `POST /api/projects` 创建成功
- 创建 `projects` 表记录 + `branches` 表默认分支配置（name=`default`, branch=`main`）
- 自动将创建者加入 `project_members`（role=`project_admin`）
- 项目名称系统内唯一，重名返回 409
- Git 地址格式校验（支持 `git@host:user/repo.git` 和 `https://`）

### AC-2: 项目列表
**Given** 用户已登录
**When** 访问项目列表
**Then**
- 系统管理员看到全部项目
- 普通用户仅看到已绑定的项目（通过 project_members 关联）

### AC-3: 编辑项目
**Given** 系统管理员编辑项目
**When** 修改 Git 地址或描述后保存
**Then** `PUT /api/projects/{id}` 更新成功，修改立即生效

### AC-4: 删除项目
**Given** 系统管理员删除项目
**When** 确认删除操作
**Then** `DELETE /api/projects/{id}` 执行成功（CASCADE 删除关联的 branches 和 project_members）

### AC-5: 权限拦截
**Given** 非 admin 用户
**When** 尝试创建/编辑/删除项目
**Then** 返回 403 错误（项目列表所有登录用户都可访问，但内容按角色过滤）

## 任务拆解 (Tasks / Subtasks)

### Task 1: 数据库模型 — Project / Branch / ProjectMember (AC: #1)

- [ ] 新建 `backend/app/models/project.py`，定义三个 ORM 模型：
  - `Project` — id, name(unique), description, git_url, script_base_path, created_at, updated_at
  - `Branch` — id, project_id(FK), name, description, branch, json_file_path, status, last_sync_at, last_commit_sha, created_at, updated_at; UNIQUE(project_id, name)
  - `ProjectMember` — id, project_id(FK), user_id(FK), role, joined_at; UNIQUE(project_id, user_id)
- [ ] 在 `alembic/env.py` 中导入新模型确保被 metadata 发现
- [ ] 生成并运行 Alembic migration
- [ ] **冒烟验证**：`alembic upgrade head` 成功，`\dt` 可见三张新表

### Task 2: Pydantic Schema (AC: #1, #2, #3)

- [ ] 新建 `backend/app/schemas/project.py`：
  - `CreateProjectRequest` — name, git_url, script_base_path, description(可选)
    - git_url: 正则校验 `^(git@|https://)`
  - `UpdateProjectRequest` — git_url, script_base_path, description（全可选）
  - `ProjectResponse` — id, name, description, git_url, script_base_path, created_at, updated_at
- [ ] **冒烟验证**：导入成功 + git_url 校验逻辑正确

### Task 3: 项目服务层 (AC: #1, #2, #3, #4)

- [ ] 新建 `backend/app/services/project_service.py`：
  - `create_project(session, data, creator_id)` — 创建项目 + 默认 branch + 创建者 member
  - `list_projects(session, current_user)` — admin 看全部，普通用户看绑定的
  - `update_project(session, project_id, data)` — 更新项目信息
  - `delete_project(session, project_id)` — 删除项目（CASCADE 自动清理关联数据）
- [ ] **冒烟验证**：函数签名和导入正确

### Task 4: 项目 API 路由 (AC: #1, #2, #3, #4, #5)

- [ ] 新建 `backend/app/api/projects.py`：
  - **POST `/api/projects`** — `require_role("admin")`，创建项目
  - **GET `/api/projects`** — `get_current_user`（所有登录用户），按角色过滤
  - **PUT `/api/projects/{project_id}`** — `require_role("admin")`
  - **DELETE `/api/projects/{project_id}`** — `require_role("admin")`
- [ ] **冒烟验证**：路由注册正确

### Task 5: 注册路由 + Alembic env 更新 (AC: all)

- [ ] `main.py` 注册 `projects_router`
- [ ] `alembic/env.py` 导入 `Project, Branch, ProjectMember`
- [ ] **冒烟验证**：跑全量已有测试确认无回归

## Dev Notes

### 关键约束

1. **三张表一起建** — projects + branches + project_members，通过外键 CASCADE 关联
2. **创建项目时的三步操作** — 插入 project → 插入默认 branch(name="default", branch="main") → 插入 project_member(creator, role="project_admin")。三步在同一个事务中
3. **项目列表按角色过滤** — admin 用 `select(Project)` 全量；普通 user 用 JOIN project_members 过滤
4. **Git URL 校验** — 只做格式校验（`git@` 或 `https://` 开头），不做连通性检查
5. **script_base_path** — 不在 API 层创建目录（那是"更新脚本"功能在 Story 2.x 的事），当前只存路径
6. **项目卡片的统计信息**（活跃分支数、用例数、执行状态）— 用例和执行表还不存在，当前 ProjectResponse 先不含这些聚合字段，后续 Story 扩展
7. **Alembic migration** — 先用 `alembic revision --autogenerate` 生成，确认 SQL 后再 `upgrade head`

### 已有基础设施

| 文件 | 提供能力 |
|------|---------|
| `app/deps/auth.py` | `get_current_user`, `require_role("admin")` |
| `app/core/exceptions.py` | `ConflictError(409)`, `NotFoundError(404)`, `ForbiddenError(403)` |
| `app/schemas/common.py` | `BaseSchema`(camelCase), `MessageResponse` |
| `app/models/user.py` | `User` 模型 + `Base` 声明基类 |

### 项目结构

```
backend/app/
├── models/
│   ├── user.py              # 已有
│   └── project.py           ← 新建：Project / Branch / ProjectMember
├── schemas/
│   └── project.py           ← 新建：CRUD 请求/响应
├── services/
│   └── project_service.py   ← 新建：项目 CRUD 业务逻辑
├── api/
│   └── projects.py          ← 新建：项目路由
└── main.py                  ← 注册 projects_router
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#projects-table]
- [Source: _bmad-output/planning-artifacts/architecture.md#branches-table]
- [Source: _bmad-output/planning-artifacts/architecture.md#project_members-table]
- [Source: _bmad-output/planning-artifacts/prd.md#FR-PROJ-001]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### Change Log

### File List
