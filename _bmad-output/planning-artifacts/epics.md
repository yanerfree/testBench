---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
---

# testBench - Epic 拆分

## 概述

本文档将测试管理平台（testBench）的全部功能需求拆分为 6 个 Epic，共约 30 个 User Story。平台基于 BMAD TEA 框架，采用 React 18 + Ant Design 5 前端 + Python FastAPI 后端 + PostgreSQL 数据库的技术栈，支持 TEA 生成用例的导入、管理、自动化/手动执行及报告导出。

每个 Story 遵循以下原则：
- 一个 Story = 一次开发会话，端到端交付价值
- Story 按顺序独立可完成，后续 Story 不反向依赖前序 Story
- 数据库表/实体在首次需要时创建，不做前置建表
- 验收标准使用 Given/When/Then 格式，覆盖边界和异常场景

## 需求清单

### 功能需求

**项目管理**
- FR-PROJ-001：创建项目（项目名称、Git 地址、脚本基础路径、成员列表）
- FR-PROJ-002：项目列表与编辑（按角色过滤、修改配置、移除成员）
**分支配置**
- FR-BRANCH-001：创建分支配置（名称、Git 分支、路径派生）
- FR-BRANCH-002：分支列表与切换（用例管理页分支选择器）
- FR-BRANCH-003：分支归档（归档/恢复、数据只读）
- FR-BRANCH-004：分支数据隔离（用例和目录结构按分支隔离）
- FR-BRANCH-005：跨分支用例复制
- FR-PROJ-003：更新脚本（在用例管理页分支上下文中，Git 拉取 + 用例状态同步）

**模块管理**
- FR-MOD-001：模块定义（名称 + 缩写码）
- FR-MOD-002：子模块定义（导入自动创建 + 手动创建）
- FR-MOD-003：用例树结构（三级树形：类型→模块→子模块）

**用例管理**
- FR-CASE-001：用例数据结构（字段定义、ID 生成规则）
- FR-CASE-002：用例导入（tea-cases.json 解析、tea_id 匹配）
- FR-CASE-003：手动新增用例
- FR-CASE-004：用例编辑（按来源限制可编辑字段）
- FR-CASE-005：用例导出 Excel
- FR-CASE-006：Flaky 标记
- FR-CASE-007：用例归档
- FR-CASE-008：批量操作（移动/归档/优先级/Flaky/加入计划）
- FR-CASE-009：列表性能与分页（虚拟滚动）
- FR-CASE-010：用例删除（软删除）

**变量与环境配置**
- FR-ENV-001：全局变量管理
- FR-ENV-002：环境管理（环境 + 环境变量）
- FR-ENV-003：变量优先级与注入规则

**通知渠道**
- FR-NOTIF-001：渠道管理（钉钉 Webhook 加密存储）
- FR-NOTIF-002：钉钉通知（执行完成 + 熔断触发）

**测试计划**
- FR-PLAN-001：创建测试计划（自动化/手动、用例选择、环境绑定）
- FR-PLAN-002：自动化计划执行
- FR-PLAN-003：手动计划执行
- FR-PLAN-004：执行队列
- FR-PLAN-005：熔断与暂停
- FR-PLAN-006：计划归档
- FR-PLAN-007：用例处理人分配
- FR-PLAN-008：自动化完成后手动录入触发
- FR-PLAN-009：计划重新打开

**执行引擎**
- FR-EXEC-001：脚本调用（pytest subprocess + 变量注入 + 结果解析）
- FR-EXEC-002：执行结果状态（通过/失败/错误/跳过/重试中）
- FR-EXEC-003：步骤级执行日志

**报告**
- FR-REPORT-001：报告下钻视图（整体→模块→用例→详情）
- FR-REPORT-002：HTML 报告导出
- FR-REPORT-003：Excel 报告导出
- FR-REPORT-004：失败详情三层展示

**操作日志**
- FR-LOG-001：日志记录
- FR-LOG-002：日志查询

### 非功能需求

**性能（NFR-PERF）**
- NFR-PERF-001：用例列表 1000 条 < 2s (P95)
- NFR-PERF-002：用例列表 10000 条 < 5s (P95)
- NFR-PERF-003：报告页加载 < 3s (P95)
- NFR-PERF-004：自动化结果回写延迟 < 5s
- NFR-PERF-005：HTML 导出 500 条 < 30s
- NFR-PERF-006：Excel 导出 500 条 < 15s
- NFR-PERF-007：钉钉推送延迟 < 30s

**并发与容量（NFR-CAP）**
- NFR-CAP-001：项目数 >= 100
- NFR-CAP-002：单项目用例数 >= 10000
- NFR-CAP-003：同时执行自动化计划 >= 5
- NFR-CAP-004：同时在线用户 >= 50
- NFR-CAP-005：单计划最大用例数 1000

**安全（NFR-SEC）**
- NFR-SEC-001：bcrypt 密码加密
- NFR-SEC-002：JWT 会话 8 小时超时
- NFR-SEC-003：API 鉴权
- NFR-SEC-004：Webhook URL AES-256 加密
- NFR-SEC-005：操作日志不可篡改
- NFR-SEC-006：参数化 SQL
- NFR-SEC-007：上传文件 <= 50MB
- NFR-SEC-008：Git 凭证系统层管理

**兼容性（NFR-COMPAT）**
- NFR-COMPAT-001~005：浏览器、分辨率、OS、Python、PostgreSQL 版本要求

**数据保留（NFR-DATA）**
- NFR-DATA-001~005：用例永久、日志 >= 1 年、导出文件 180 天

**可用性（NFR-AVAIL）**
- NFR-AVAIL-001~003：工作时间可用率 >= 99%、重启数据完整、单服务故障不影响核心功能

**可维护性（NFR-MAINT）**
- NFR-MAINT-001~003：日志滚动、trace_id、Alembic 迁移

### 架构附加需求

- 两级角色体系：系统级 (admin/user) + 项目级 (project_admin/developer/tester/guest)
- case_folders 路径模式（最多 4 层），取代 modules + sub_modules 两表
- arq + Redis 任务队列（Worker 池 4-6），支持后续多节点扩展
- Git bare clone + worktree 三层目录模型（bare repo / 分支配置 worktree / 执行沙箱）
- camelCase 转换策略：后端全程 snake_case，API 出口统一转 camelCase
- 统一异常体系 + trace_id + 全局 exception handler
- 幂等性：POST 创建支持 X-Idempotency-Key

### UX 设计需求

- 马卡龙色系（主色 #6b7ef5）
- 前端状态色统一引用（STATUS_CONFIG 常量），禁止组件内硬编码色值
- 虚拟滚动（单页 100 条时 FPS >= 50）
- 三层懒加载报告 API
- 手动录入独立页面

### FR 覆盖映射

| FR 编号 | Epic |
|---------|------|
| FR-PROJ-001 | Epic 1 |
| FR-PROJ-002 | Epic 1 |
| FR-PROJ-003 | Epic 2 |
| FR-BRANCH-001 | Epic 2 |
| FR-BRANCH-002 | Epic 2 |
| FR-BRANCH-003 | Epic 2 |
| FR-BRANCH-004 | Epic 2 |
| FR-BRANCH-005 | Epic 2 |
| FR-MOD-001 | Epic 2 |
| FR-MOD-002 | Epic 2 |
| FR-MOD-003 | Epic 2 |
| FR-CASE-001 | Epic 2 |
| FR-CASE-002 | Epic 2 |
| FR-CASE-003 | Epic 2 |
| FR-CASE-004 | Epic 2 |
| FR-CASE-005 | Epic 2 |
| FR-CASE-006 | Epic 2 |
| FR-CASE-007 | Epic 2 |
| FR-CASE-008 | Epic 2 |
| FR-CASE-009 | Epic 2 |
| FR-CASE-010 | Epic 2 |
| FR-ENV-001 | Epic 3 |
| FR-ENV-002 | Epic 3 |
| FR-ENV-003 | Epic 3 |
| FR-NOTIF-001 | Epic 3 |
| FR-PLAN-001 | Epic 4 |
| FR-PLAN-002 | Epic 4 |
| FR-PLAN-003 | Epic 4 |
| FR-PLAN-004 | Epic 4 |
| FR-PLAN-005 | Epic 4 |
| FR-PLAN-006 | Epic 4 |
| FR-PLAN-007 | Epic 4 |
| FR-PLAN-008 | Epic 4 |
| FR-PLAN-009 | Epic 4 |
| FR-EXEC-001 | Epic 4 |
| FR-EXEC-002 | Epic 4 |
| FR-EXEC-003 | Epic 4 |
| FR-REPORT-001 | Epic 5 |
| FR-REPORT-002 | Epic 5 |
| FR-REPORT-003 | Epic 5 |
| FR-REPORT-004 | Epic 5 |
| FR-NOTIF-002 | Epic 5 |
| FR-LOG-001 | Epic 6 |
| FR-LOG-002 | Epic 6 |

## Epic 列表

| Epic | 名称 | Story 数 | 核心价值 |
|------|------|---------|---------|
| Epic 1 | 项目基础与用户体系 | 6 | 用户可登录，管理员可管理用户、项目和成员，RBAC 权限体系就绪 |
| Epic 2 | 分支与用例管理 | 8 | 分支配置管理、Git 脚本同步、用例导入/创建/编辑/归档/批量操作完整可用 |
| Epic 3 | 变量与环境配置 | 3 | 全局变量、环境变量两层体系可用，通知渠道配置就绪 |
| Epic 4 | 测试计划与执行引擎 | 7 | 测试计划创建与执行（自动化+手动+混合），熔断、队列、暂停/恢复完整可用 |
| Epic 5 | 报告与通知 | 4 | 四层下钻报告、HTML/Excel 异步导出、钉钉通知完整可用 |
| Epic 6 | 审计与运维 | 2 | 操作日志记录与查询、健康检查端点 |

---

## Epic 1: 项目基础与用户体系

**目标：** 搭建平台基础框架，实现用户认证、用户管理、项目管理和成员绑定，建立 RBAC 权限体系，为后续所有功能提供安全基座。

### Story 1.1: 后端项目脚手架与用户表

As a 开发者,
I want 搭建 FastAPI 后端项目结构、配置数据库连接和 Alembic 迁移、创建 users 表和初始管理员账号,
So that 后续所有 Story 有统一的项目骨架和数据库基础设施可复用。

**关联需求：** NFR-SEC-001, NFR-SEC-006, NFR-MAINT-003

**验收标准：**

**Given** 后端项目尚未初始化
**When** 开发者运行项目初始化脚本
**Then**
- FastAPI 应用启动成功，`GET /api/healthz` 返回 `{"status": "ok"}`
- 项目结构符合架构文档（app/api, app/models, app/schemas, app/services, app/engine, app/core, app/deps）
- PostgreSQL 数据库连接成功（asyncpg）
- Alembic 迁移配置完成，首个 migration 创建 `users` 表（字段：id UUID, username, password, role, is_active, created_at, updated_at）
- `alembic upgrade head` 执行成功
- 初始管理员账号通过 seed 脚本创建（username=admin, role=admin）
- 密码使用 bcrypt (cost >= 10) 加密存储，明文不落库不打印
- 统一异常体系（AppError 基类 + NotFoundError/ForbiddenError/ConflictError）已就绪
- 全局 exception handler 统一输出 `{"error": {"code": ..., "message": ..., "detail": ...}}` 格式
- CamelCaseResponse 已配置，API 响应自动 snake_case → camelCase 转换
- CORS 中间件 + trace_id 中间件已配置

### Story 1.2: 登录页与 JWT 认证流程

As a 用户,
I want 在登录页输入用户名和密码完成登录，获取 JWT token 并在后续请求中自动携带,
So that 我可以安全地访问平台功能。

**关联需求：** NFR-SEC-002, NFR-SEC-003

**验收标准：**

**Given** 用户访问平台根路径且未登录
**When** 浏览器加载页面
**Then** 自动重定向到登录页 `/login`

**Given** 用户在登录页输入正确的用户名和密码
**When** 点击登录按钮
**Then**
- 后端 `POST /api/auth/login` 验证通过，返回 JWT token（有效期 8 小时）
- 前端存储 token，后续请求通过 `Authorization: Bearer {token}` 携带
- 登录成功后跳转至首页

**Given** 用户在登录页输入错误的密码
**When** 点击登录按钮
**Then** 页面提示"用户名或密码错误"，不泄露具体哪个字段错误

**Given** 用户已登录且 token 剩余有效期 < 2 小时
**When** 发起任意 API 请求
**Then** 后端在 response header 返回 `X-New-Token`，前端静默替换本地 token

**Given** 用户已登录
**When** 调用 `GET /api/auth/me`
**Then** 返回当前用户信息（id, username, role）

**Given** 用户已登录
**When** 点击登出
**Then** 前端清除 token，跳转至登录页

**Given** 未携带 token 或 token 已过期
**When** 访问任何需鉴权的 API
**Then** 返回 401 错误

### Story 1.3: 用户 CRUD 管理

As a 系统管理员,
I want 创建、编辑、删除用户账号，管理用户的系统角色和激活状态,
So that 团队成员可以使用平台。

**关联需求：** FR-LOG-001（审计日志装饰器在此 Story 埋点，Epic 6 完善存储）

**验收标准：**

**Given** 系统管理员已登录
**When** 访问用户管理页面
**Then** 展示所有用户列表，包含用户名、角色、状态、创建时间

**Given** 系统管理员在用户管理页面点击"新建用户"
**When** 填写用户名（唯一）、密码、系统角色（admin/user），点击保存
**Then**
- `POST /api/users` 创建成功，密码 bcrypt 加密存储
- 用户名重复时返回 409 错误

**Given** 系统管理员编辑某用户
**When** 修改角色或激活状态后保存
**Then** `PUT /api/users/{id}` 更新成功，变更立即生效

**Given** 系统管理员删除某用户
**When** 确认删除操作
**Then** `DELETE /api/users/{id}` 执行成功；若该用户已绑定项目，提示"该用户已绑定 N 个项目，删除后将自动解除绑定"

**Given** 非系统管理员用户已登录
**When** 尝试访问用户管理 API
**Then** 返回 403 错误

### Story 1.4: 项目 CRUD

As a 系统管理员或项目管理员,
I want 创建项目（含 Git 仓库地址和脚本基础路径），并在创建时自动生成默认分支配置,
So that 团队可以开始接入测试管理。

**关联需求：** FR-PROJ-001, FR-PROJ-002

**验收标准：**

**Given** 系统管理员已登录
**When** 创建项目，填写项目名称、Git 仓库地址、脚本基础路径
**Then**
- `POST /api/projects` 创建成功
- 创建 `projects` 表记录 + `branches` 表默认分支配置记录（name=`default`, branch=`main`）
- 项目名称系统内唯一，重名返回 409
- Git 地址格式校验（支持 `git@host:user/repo.git` 和 `https://`）
- 脚本基础路径不存在时自动创建该目录
- 成员列表至少包含创建者本人（自动添加）

**Given** 用户已登录
**When** 访问项目列表
**Then**
- 系统管理员看到全部项目
- 其他角色仅看到已绑定的项目
- 项目卡片展示活跃分支配置数量、总用例数、最近一次执行状态

**Given** 项目管理员编辑项目
**When** 修改 Git 地址或脚本基础路径后保存
**Then** `PUT /api/projects/{id}` 更新成功，修改立即生效

**Given** 非管理员角色（开发/测试/游客）
**When** 尝试创建或编辑项目
**Then** 返回 403 错误

### Story 1.5: 项目成员管理

As a 系统管理员或项目管理员,
I want 将用户绑定到项目并指定项目级角色（project_admin/developer/tester/guest），
So that 成员可以按权限访问和操作项目数据。

**关联需求：** FR-PROJ-001 AC4, FR-PROJ-002 AC3

**验收标准：**

**Given** 项目管理员进入项目详情的成员管理 Tab
**When** 点击"添加成员"，选择用户并指定项目角色
**Then**
- `POST /api/projects/{id}/members` 绑定成功
- 创建 `project_members` 表记录（project_id, user_id, role）
- 同一用户不可重复绑定同一项目（唯一约束）
- 绑定后该用户立即可在项目列表看到该项目

**Given** 项目管理员修改某成员的项目角色
**When** 选择新角色后保存
**Then** 角色变更立即生效

**Given** 项目管理员移除某成员
**When** 确认移除操作
**Then** `DELETE /api/projects/{id}/members/{userId}` 执行成功，该用户立即失去项目访问权

**Given** 项目管理员尝试移除最后一个项目管理员
**When** 执行移除操作
**Then** 返回 422 错误，提示"项目至少需要一个管理员"

**Given** 非管理员角色
**When** 尝试添加或移除项目成员
**Then** 返回 403 错误

### Story 1.6: RBAC 权限体系全局强制

As a 平台用户,
I want 所有 API 和页面操作都受到基于角色的权限控制,
So that 不同角色只能执行其被授权的操作，数据安全有保障。

**关联需求：** NFR-SEC-003, PRD 3.1/3.2

**验收标准：**

**Given** 两级角色体系已实现（系统级 admin/user + 项目级 project_admin/developer/tester/guest）
**When** 任何用户调用需项目上下文的 API
**Then**
- 权限检查中间件/装饰器自动拦截
- 系统管理员（admin）可访问所有项目所有数据
- 非 admin 用户必须通过 project_members 绑定才能访问该项目
- project_admin 可管理所属项目配置和成员
- developer/tester 可操作用例、执行、结果录入，但不可改项目配置
- guest 仅查看，所有写操作按钮前端隐藏，后端返回 403

**Given** 游客用户已登录并绑定到项目
**When** 浏览用例/计划/报告页面
**Then** 所有操作按钮（编辑/执行/导入/删除）不展示

**Given** 用户尝试访问未绑定的项目
**When** 调用该项目的任何 API
**Then** 返回 403 错误

**Given** 权限检查装饰器已实现
**When** 新增 API 端点
**Then** 开发者只需添加 `@require_role("tester")` 或 `@require_project_role("project_admin")` 即可启用权限检查

---

## Epic 2: 分支与用例管理

**目标：** 实现分支配置管理、Git 脚本同步、用例导入（tea-cases.json）、手动创建/编辑/归档/删除用例、用例树导航、列表分页与虚拟滚动、批量操作，使用例管理完整可用。

### Story 2.1: 分支配置 CRUD

As a 项目管理员,
I want 在项目下创建、编辑、归档和恢复分支配置,
So that 我可以管理不同版本/分支的用例集和脚本目录。

**关联需求：** FR-BRANCH-001, FR-BRANCH-002, FR-BRANCH-003, FR-BRANCH-004

**验收标准：**

**Given** 项目管理员进入项目设置
**When** 创建新分支配置，填写名称和 Git 分支名
**Then**
- `POST /api/projects/{id}/branches` 创建成功
- 分支配置名称在项目内唯一，重名返回 409
- 名称仅允许 `[a-zA-Z0-9_-]`，最长 50 字符，不符合返回 422
- 名称创建后不可修改（关联文件系统路径派生）
- Git 分支字段可选，默认 `main`
- 脚本目录自动派生为 `{项目脚本基础路径}/{分支配置名称}/`

**Given** 项目管理员编辑分支配置
**When** 修改 Git 分支名（如从 `main` 改为 `release/2.0`）
**Then** `PUT /api/branches/{id}` 更新成功，下次"更新脚本"时拉取新分支代码

**Given** 项目管理员归档某分支配置
**When** 点击归档按钮
**Then**
- `POST /api/branches/{id}/archive` 执行成功
- 该分支的用例数据变为只读
- 用例管理页分支选择器中，已归档分支显示在"已归档"分组

**Given** 项目管理员尝试归档最后一个活跃分支配置
**When** 执行归档操作
**Then** 返回 422 错误，提示"项目至少保留一个活跃分支配置"

**Given** 项目管理员恢复已归档的分支配置
**When** 点击恢复按钮
**Then** `POST /api/branches/{id}/activate` 执行成功，分支恢复为活跃状态

**Given** 用例管理页面加载
**When** 展示分支选择器
**Then** 列出所有分支配置，按状态分组（活跃/已归档），每项显示名称、Git 分支、用例数

### Story 2.2: Git 服务与脚本同步

As a 项目成员,
I want 在用例管理页点击"更新脚本"按钮，从 Git 仓库拉取指定分支的最新代码,
So that 本地脚本与远程仓库保持同步。

**关联需求：** FR-PROJ-003, FR-BRANCH-001 AC7

**验收标准：**

**Given** 项目已配置 Git 仓库地址，用户选择了目标分支配置
**When** 首次点击"更新脚本"
**Then**
- 后端 `POST /api/branches/{id}/sync` 触发异步任务
- 执行 `git clone --bare` 创建 bare 仓库（如尚不存在）
- 执行 `git fetch origin --prune` + `git worktree add` 创建分支配置工作目录
- 进度条显示 git 操作状态
- 完成后展示摘要：新增 N / 修改 M / 删除 K 文件
- `branches.last_commit_sha` 和 `branches.last_sync_at` 更新

**Given** 分支配置已有工作目录（非首次同步）
**When** 点击"更新脚本"
**Then**
- 执行 `git fetch origin --prune` + `git checkout origin/{branch}`（detached HEAD）
- 更新 last_commit_sha

**Given** Git 拉取失败（如认证错误、网络不通）
**When** 同步任务异常
**Then** 显示明确的错误信息（如"Git 认证失败，请检查服务器 SSH 配置"），不影响平台其他功能

**Given** 不同分支配置同时触发脚本更新
**When** 两个同步任务并发执行
**Then** 各自独立完成，互不影响（FileLock 保证 fetch 串行）

### Story 2.3: 用例导入（tea-cases.json）

As a 测试人员,
I want 上传 tea-cases.json 文件或通过 Git 更新后自动读取，将 TEA 生成的用例导入到当前分支配置,
So that 我不需要手动逐条录入 TEA 生成的用例。

**关联需求：** FR-CASE-001, FR-CASE-002, FR-MOD-001, FR-MOD-002

**验收标准：**

**Given** 测试人员在用例管理页选择了目标分支
**When** 点击"导入"按钮，上传 `.json` 后缀的 tea-cases.json 文件
**Then**
- `POST /api/branches/{id}/cases/import` 接收文件
- 仅接受 `.json` 后缀文件，否则返回 400
- 文件大小 <= 50MB（NFR-SEC-007）
- JSON 解析失败时返回具体错误位置
- 创建 `cases` 表（首次使用时创建对应 migration）
- 创建 `case_folders` 表用于目录结构

**Given** 导入过程中解析每条用例
**When** 按 `tea_id` 匹配
**Then**
- 平台没有该 tea_id → 新增用例，分配 `TC-{MODULE}-{seq5}` 编号，来源 = `imported`
- 平台已有该 tea_id → 更新元数据（标题、步骤、优先级、script_ref 等），保留平台 ID
- 平台有但 JSON 中消失 → 标记自动化状态为「脚本已移除」
- 缺必填字段（id/type/title/module/script_ref）→ 跳过该条并记录原因

**Given** 导入数据中包含新的 module 或 submodule
**When** case_folders 中不存在对应目录
**Then** 自动创建模块目录和子模块目录（如 `AUTH/LOGIN`），导入摘要中提示"新建模块 N 个 / 新建子模块 M 个"

**Given** 导入完成
**When** 返回结果
**Then** 展示摘要：新增 N / 更新 M / 脚本已移除 K / 跳过 L（含跳过原因）

**Given** 用户通过 Git 更新用例（"更新用例"按钮）
**When** `POST /api/branches/{id}/cases/sync` 触发
**Then** 从分支配置工作目录中读取 `tea-cases.json`，执行相同的导入匹配逻辑

### Story 2.4: 用例手动 CRUD 与详情页

As a 测试人员,
I want 手动创建、编辑用例，查看用例详情,
So that 我可以管理没有自动化脚本的手动测试用例。

**关联需求：** FR-CASE-001, FR-CASE-003, FR-CASE-004

**验收标准：**

**Given** 测试人员在用例管理页点击"新建用例"
**When** 填写表单（标题、类型 API/E2E、模块、子模块、优先级、前置条件、测试步骤、预期结果）
**Then**
- `POST /api/branches/{id}/cases` 创建成功
- 用例 ID 格式 `TC-{MODULE}-{seq5}`，系统建议默认值，用户可在保存前覆盖（需符合格式且模块内唯一）
- 来源自动设为「手动」，不可修改
- script_ref 字段可选；填写后校验该路径在脚本目录中是否存在
- 标题非空，最长 200 字符
- 步骤列表至少 1 条
- 用例保存后 ID 字段变为只读

**Given** 用户点击某用例进入详情页
**When** 页面加载
**Then** `GET /api/cases/{id}` 返回完整用例信息，展示所有字段

**Given** 用户编辑导入来源的用例
**When** 修改字段后保存
**Then**
- 可编辑：标题、优先级、前置条件、步骤、预期、备注、Flaky 标记
- 不可编辑：type、module、script_ref（灰色不可操作）

**Given** 用户编辑手动来源的用例
**When** 修改字段后保存
**Then** 所有字段均可编辑（含 type、module、script_ref）

### Story 2.5: 用例目录树导航

As a 测试人员,
I want 在用例管理页左侧看到三级树形导航（类型→模块→子模块），点击节点筛选用例列表,
So that 我可以快速定位特定模块的用例。

**关联需求：** FR-MOD-003, FR-MOD-001, FR-MOD-002

**验收标准：**

**Given** 用户进入用例管理页
**When** 左侧面板加载
**Then**
- `GET /api/branches/{id}/folders` 返回目录树
- 顶层 Tab 切换 API / E2E 类型
- 树形结构：类型 → 模块（如 AUTH）→ 子模块（如 LOGIN，可选）→ 用例节点
- 未指定子模块的用例直接显示在模块节点下
- 每个节点右侧显示用例计数
- 树形可展开/收起

**Given** 用户右键点击模块节点
**When** 选择"新建子模块"
**Then** 弹出输入框，填写名称后创建，名称在模块内唯一

**Given** 用户点击导航树底部"+"按钮
**When** 填写模块名称和缩写码
**Then**
- `POST /api/branches/{id}/folders` 创建模块
- 缩写码全大写，仅含 A-Z 和数字，项目内唯一
- 缩写码在任意用例创建或导入后变为只读

**Given** 用户右键点击空模块/子模块节点
**When** 选择"删除"
**Then** 仅允许删除无用例的节点，有用例时提示"该目录下存在 N 条用例，请先移动或删除"

**Given** 用户点击某个目录节点
**When** 切换选中状态
**Then** 右侧用例列表自动筛选为该目录下的用例

### Story 2.6: 用例列表、筛选与分页

As a 测试人员,
I want 用例列表支持多条件筛选、分页和虚拟滚动,
So that 我可以高效浏览和查找大量用例。

**关联需求：** FR-CASE-009, NFR-PERF-001, NFR-PERF-002

**验收标准：**

**Given** 用户进入用例管理页
**When** 用例列表加载
**Then**
- `GET /api/branches/{id}/cases` 返回分页数据
- 分页默认每页 20 条，可选 20 / 50 / 100
- 支持筛选：类型（API/E2E）、模块、优先级（P0-P3）、自动化状态、Flaky 标记、关键字搜索（标题/用例 ID）
- 树形导航选中状态与列表筛选联动

**Given** 单页选择 100 条
**When** 页面渲染
**Then** 使用虚拟滚动，滚动帧率 FPS >= 50

**Given** 项目有 1000 条用例
**When** 用例列表加载
**Then** 响应时间 < 2 秒（P95）

**Given** 项目有 10000 条用例
**When** 使用关键字搜索
**Then** 搜索响应 < 500ms

### Story 2.7: 用例批量操作

As a 测试人员,
I want 在用例列表多选后执行批量操作（移动/归档/优先级/Flaky/加入计划）,
So that 我可以高效管理大量用例。

**关联需求：** FR-CASE-008

**验收标准：**

**Given** 用户在用例列表勾选多条用例
**When** 列表顶部显示批量操作工具栏
**Then**
- 显示已选数量
- 支持操作：批量移动到其他模块/子模块、批量归档/取消归档、批量修改优先级（P0-P3）、批量标记/取消标记 Flaky、批量加入测试计划

**Given** 用户选择"全选当前页"或"全选筛选结果"
**When** 勾选后选择批量操作
**Then**
- 执行前显示确认弹窗（含影响数量）
- `POST /api/branches/{id}/cases/batch` 批量执行
- 完成后展示成功/失败计数
- 部分失败时返回 `{"succeeded": N, "failed": M, "errors": [...]}`

**Given** 批量操作包含已归档的用例
**When** 执行非取消归档的操作
**Then** 跳过已归档用例，在 errors 中返回原因"已归档用例不可操作"

### Story 2.8: 用例归档、软删除、Flaky 标记与跨分支复制

As a 测试人员,
I want 归档/恢复用例、软删除用例、标记 Flaky 用例、将用例从其他分支复制过来,
So that 我可以完整管理用例生命周期并避免新分支从零开始。

**关联需求：** FR-CASE-006, FR-CASE-007, FR-CASE-010, FR-CASE-005, FR-BRANCH-005

**验收标准：**

**Given** 用户在用例详情页点击"归档"
**When** 确认操作
**Then**
- 用例自动化状态变为「已归档」
- 已归档用例不出现在创建计划时的用例选择列表
- 历史执行记录中已归档用例仍可查看
- 归档操作可逆，可恢复为之前的自动化状态

**Given** 用户删除用例
**When** 确认删除操作
**Then**
- 软删除：标记 `deleted_at` 时间戳，前端不再展示
- 已被测试计划引用的用例，删除时二次确认，提示"该用例被 N 个计划引用，删除后历史执行记录保留但标记为'用例已删除'"
- 删除操作记录到操作日志

**Given** 用户在用例详情页勾选"标记为 Flaky"
**When** 保存操作
**Then**
- `is_flaky = true`
- 用例列表 Flaky 用例高亮显示并可按此筛选
- 自动化计划执行时 Flaky 用例跳过（结果显示「跳过-Flaky」）
- 手动计划执行时 Flaky 用例正常显示

**Given** 用户在目标分支的用例列表页点击"从其他分支导入"
**When** 选择源分支配置，通过模块/关键词筛选用例，确认复制
**Then**
- 复制产生新的用例记录（新 UUID、新用例 ID 编号），module 归属不变
- 目标分支不存在的目录结构自动创建
- 复制是深拷贝（步骤、预期结果等一并复制），不建立引用关系
- 完成后显示摘要："成功复制 X 条用例"

**Given** 用户在用例列表点击"导出 Excel"
**When** 按当前筛选条件导出
**Then**
- Excel 包含全部字段（含步骤、预期等长文本）
- 500 条以内导出在 15 秒内完成

---

## Epic 3: 变量与环境配置

**目标：** 实现全局变量管理、环境与环境变量管理、通知渠道配置，为测试执行提供变量注入能力和通知基础设施。

### Story 3.1: 全局变量 CRUD

As a 项目成员（非游客）,
I want 管理全局变量（键值对），用于跨环境通用的配置（如公共 token、超时时间）,
So that 测试执行时这些变量自动注入到测试进程中。

**关联需求：** FR-ENV-001

**验收标准：**

**Given** 非游客用户访问全局变量管理页面
**When** 页面加载
**Then**
- `GET /api/global-variables` 返回全部全局变量列表
- 创建 `global_variables` 表（首次使用时创建对应 migration）

**Given** 用户添加新全局变量
**When** 填写 key 和 value 后保存
**Then**
- key 格式校验：`^[A-Za-z][A-Za-z0-9_]{0,62}$`（字母开头，最长 63 字符）
- key 在全局范围内唯一，重名返回 409
- key 命中系统保留黑名单（PATH, HOME, PYTHONPATH 等 20 个）时返回 422，提示"该变量名为系统保留变量，不允许覆盖"
- `PUT /api/global-variables` 批量更新（全量替换模式）

**Given** 游客用户访问全局变量页面
**When** 页面加载
**Then** 变量列表只读，不展示添加/编辑/删除按钮

**Given** 用户删除某全局变量
**When** 确认删除
**Then** 变量从列表移除，下次执行时不再注入该变量

### Story 3.2: 环境与环境变量 CRUD

As a 项目成员（非游客）,
I want 创建和管理多个环境（如开发、测试、预发布），每个环境有独立的环境变量集合，
支持环境复制，
So that 测试执行时可选择不同环境，注入对应的变量配置。

**关联需求：** FR-ENV-002, FR-ENV-003

**验收标准：**

**Given** 用户访问环境管理页面
**When** 页面加载
**Then**
- `GET /api/environments` 返回所有环境列表
- 创建 `environments` 表 + `environment_variables` 表

**Given** 用户创建新环境
**When** 填写环境名称后保存
**Then**
- `POST /api/environments` 创建成功
- 环境名称系统内唯一，重名返回 409
- 环境是全局资源，不绑定项目

**Given** 用户进入某环境的变量管理
**When** 添加/编辑/删除环境变量
**Then**
- `PUT /api/environments/{id}/variables` 批量更新
- key 格式校验规则同全局变量
- key 在环境内唯一
- 同样受系统保留黑名单限制

**Given** 用户查看合并后的变量预览
**When** 点击"预览合并变量"
**Then**
- `GET /api/environments/{id}/merged-variables` 返回全局变量 + 环境变量合并结果
- 同名 key 时环境变量覆盖全局变量，标注来源

**Given** 用户复制某环境
**When** 点击"复制环境"按钮并指定新名称
**Then**
- `POST /api/environments/{id}/clone` 创建新环境
- 环境变量完整复制到新环境

**Given** 用户尝试删除某环境
**When** 该环境被测试计划引用
**Then** 返回 422 错误，提示"该环境被 N 个计划引用，请先解除引用"

### Story 3.3: 通知渠道 CRUD（钉钉 Webhook）

As a 项目成员（非游客）,
I want 配置钉钉 Webhook 通知渠道，用于测试完成和熔断时的消息推送,
So that 团队能及时收到测试执行的关键通知。

**关联需求：** FR-NOTIF-001

**验收标准：**

**Given** 用户访问通知渠道管理页面
**When** 页面加载
**Then**
- `GET /api/channels` 返回所有通知渠道列表
- 创建 `notification_channels` 表

**Given** 用户创建新的钉钉渠道
**When** 填写渠道名称和 Webhook URL 后保存
**Then**
- `POST /api/channels` 创建成功
- 渠道名称系统内唯一
- Webhook URL 格式校验（必须以 `https://oapi.dingtalk.com/` 开头）
- Webhook URL 使用 AES-256 加密存储
- 前端展示时 URL 显示遮罩（如 `https://oapi.dingtalk.com/robot/send?acc***`）

**Given** 用户编辑某渠道的 Webhook URL
**When** 保存新 URL
**Then** 新 URL 加密存储，旧 URL 被覆盖

**Given** 游客用户访问通知渠道页面
**When** 页面加载
**Then** 渠道列表只读，不展示操作按钮

---

## Epic 4: 测试计划与执行引擎

**目标：** 实现测试计划创建、自动化执行（pytest subprocess + 结果解析）、手动执行（手动录入页面）、混合执行、熔断机制、执行队列、暂停/恢复/终止、计划重新打开与归档，使测试计划全生命周期管理完整可用。

### Story 4.1: 测试计划 CRUD

As a 测试人员,
I want 创建测试计划（选择自动化/手动类型、测试类型、用例集、目标环境、通知渠道）,
查看计划列表和详情,
So that 我可以组织和管理测试执行。

**关联需求：** FR-PLAN-001, FR-PLAN-006

**验收标准：**

**Given** 测试人员在测试计划页点击"新建计划"
**When** 填写表单
**Then**
- `POST /api/projects/{id}/plans` 创建成功
- 创建 `plans` 表 + `plan_cases` 关联表
- 计划类型：自动化 / 手动
- 测试类型：API / E2E（不可混合）
- 用例集至少 1 条，最多 1000 条
- 可从项目内任意分支配置中选择用例，支持跨分支混选
- 自动化计划必填环境和通知渠道
- 手动计划环境和通知渠道可选
- 失败重试次数（0-3，仅自动化）
- 熔断配置默认值：连续失败 5 条暂停，失败率 50% 暂停

**Given** 用户查看计划列表
**When** 页面加载
**Then**
- `GET /api/projects/{id}/plans` 返回分页列表
- 展示：计划名、类型、状态、用例数、通过率、创建时间
- 支持按状态筛选

**Given** 计划状态为草稿
**When** 编辑计划
**Then** 可修改所有字段

**Given** 计划状态为执行中/已完成/已归档
**When** 尝试编辑
**Then** 不可编辑，编辑按钮灰色不可操作

**Given** 计划状态为已完成
**When** 点击"归档"
**Then**
- `POST /api/plans/{id}/archive` 执行成功
- 计划状态变为「已归档」，只读，不可再执行

**Given** 计划状态为已归档
**When** 点击"删除"
**Then** 二次确认弹窗，确认后彻底删除计划 + 关联执行记录

### Story 4.2: 执行引擎 — 沙箱创建与 pytest 调用

As a 平台（后台服务）,
I want 为每次自动化执行创建隔离的 Git worktree 沙箱，在沙箱中调用 pytest 执行脚本，并解析 JUnit XML + 步骤级 JSON 结果,
So that 自动化测试在隔离环境中安全执行，结果准确收集。

**关联需求：** FR-EXEC-001, FR-EXEC-002, FR-EXEC-003

**验收标准：**

**Given** 自动化计划触发执行
**When** 执行引擎开始处理
**Then**
- 创建 `test_reports` 表 + `test_report_scenarios` 表 + `test_report_steps` 表
- 基于分支配置的 last_commit_sha 创建沙箱：`git worktree add --detach {sandbox_dir} {commit_sha}`
- 沙箱目录：`{项目脚本基础路径}/.sandboxes/{execution_id}/`
- 沙箱创建串行（FileLock），创建完后 pytest 可并行

**Given** 沙箱已创建
**When** 执行单条自动化用例
**Then**
- 根据 `script_ref.file` 拼接完整脚本路径
- 脚本文件不存在时，标记「跳过-脚本已移除」
- 全局变量 + 环境变量合并后通过 `os.environ` 注入测试进程（环境变量 > 全局变量）
- 变量快照写入 `test_reports.variables_snapshot`
- `subprocess.run` 调用 pytest，在 arq Worker 中执行（anyio.to_thread.run_sync 包装）
- 执行超时保护：timeout + process.kill()

**Given** pytest 执行完成
**When** 解析结果
**Then**
- 解析 JUnit XML 提取每条用例结果（passed/failed/error）
- 解析步骤级 JSON（`{case_id}.json`），提取步骤状态、耗时、API 请求响应、截图路径
- 缺少步骤级 JSON（旧脚本兼容）仅保存原始堆栈
- 失败用例的错误信息和调用栈完整保存

**Given** 执行完成（无论成败）
**When** 清理沙箱
**Then**
- `git worktree remove --force {sandbox_dir}`
- 失败则 `rm -rf` + `git worktree prune` 兜底
- Worker 启动时扫描 `.sandboxes/` 清理残留目录

### Story 4.3: 自动化计划执行流程

As a 测试人员,
I want 点击"执行"按钮后，平台逐条执行已自动化用例，实时显示进度，失败自动重试,
So that 我可以高效完成自动化测试并实时跟踪进度。

**关联需求：** FR-PLAN-002, FR-EXEC-002

**验收标准：**

**Given** 测试人员在草稿状态的自动化计划详情页点击"执行"
**When** `POST /api/plans/{id}/execute` 触发
**Then**
- 计划状态从「草稿」变为「执行中」
- 筛选「已自动化」且非 Flaky 的用例逐条执行
- Flaky 用例标记为「跳过-Flaky」
- 「待自动化」用例暂不执行，等待后续手动录入

**Given** 自动化执行进行中
**When** 前端轮询进度
**Then**
- 实时显示进度（已执行 N / 总 M）
- 每条用例结果实时更新（通过/失败/错误/跳过）

**Given** 单条用例执行失败
**When** 配置了重试次数 > 0
**Then**
- 按重试次数自动重试
- 最终结果取最后一次执行结果
- 状态中间态为「重试中」

**Given** 所有自动化用例执行完成，但计划包含「待自动化」或「Flaky」用例
**When** 自动执行阶段结束
**Then**
- 计划进入「待手动录入」阶段
- 计划详情页显示"自动执行已完成，N 条用例待手动录入"横幅
- 结果回写延迟 < 5 秒

**Given** 计划全部为已自动化用例且无 Flaky
**When** 自动执行完成
**Then** 计划状态直接变为「已完成」

### Story 4.4: 手动计划执行（手动录入页面）

As a 测试人员,
I want 在手动计划中逐条查看用例步骤、执行后录入结果（通过/失败）+ 备注,
So that 手动测试结果也能集中管理和追踪。

**关联需求：** FR-PLAN-003

**验收标准：**

**Given** 测试人员在草稿状态的手动计划详情页点击"执行"
**When** `POST /api/plans/{id}/execute` 触发
**Then**
- 计划状态从「草稿」变为「执行中」
- 所有用例直接进入手动录入模式
- 跳转到独立的手动录入页面

**Given** 测试人员在手动录入页面
**When** 逐条处理用例
**Then**
- 每条用例展示：标题、模块、前置条件、步骤、预期结果
- 录入项：结果（通过/失败）、备注（可选）、实际执行时长（可选）
- 支持筛选：全部 / 待录入 / 已录入通过 / 已录入失败
- 每条用例录入后即时保存（`POST /api/plans/{id}/manual-record`），无需整体提交

**Given** 测试人员在手动录入页面
**When** 部分用例已录入，暂时离开
**Then** 已录入的结果保留，下次进入继续录入

**Given** 所有手动用例录入完成
**When** 用户点击"确认完成"
**Then**
- `POST /api/plans/{id}/complete` 执行
- 计划状态从「执行中」变为「已完成」
- 手动计划不发送任何钉钉通知

### Story 4.5: 混合执行 — 自动完成后手动录入与处理人分配

As a 测试 Lead,
I want 在自动化计划中混合自动和手动用例，自动执行完成后开放手动录入入口，并可为手动用例分配处理人,
So that 一次性完成自动+手动混合执行闭环。

**关联需求：** FR-PLAN-002, FR-PLAN-007, FR-PLAN-008

**验收标准：**

**Given** 自动化计划包含「已自动化」和「待自动化」用例
**When** 自动执行阶段完成
**Then**
- 计划详情页显示「开始手动录入」按钮
- 状态横幅："自动执行已完成，N 条用例待手动录入"
- 若计划包含 Flaky 用例，Flaky 用例也进入待手动录入

**Given** 测试 Lead 进入计划详情
**When** 点击"分配处理人"
**Then**
- 支持单条/批量分配处理人（`PUT /api/plans/{id}/assign`）
- 处理人候选范围为该项目成员
- 已分配处理人的用例，仅该处理人可录入，其他人只读
- 未分配处理人的用例所有项目成员均可录入
- Lead（项目管理员或测试角色）可随时重新分配

**Given** 所有用例（自动+手动）均已完成
**When** 用户点击"确认完成"
**Then** 计划状态变为「已完成」

**Given** 处理人字段记录在执行结果中
**When** 导出报告
**Then** 报告中可见每条用例的处理人

### Story 4.6: 熔断、暂停/恢复/终止与执行队列

As a 测试人员,
I want 自动化计划在连续失败或失败率过高时自动熔断暂停，支持手动暂停/恢复/终止操作，同项目同类型计划排队执行,
So that 避免浪费执行资源，并保持执行有序。

**关联需求：** FR-PLAN-004, FR-PLAN-005

**验收标准：**

**Given** 自动化计划执行中
**When** 触发熔断条件（连续失败 N 条 或 失败率超过阈值）
**Then**
- 计划状态从「执行中」变为「已暂停」
- 已执行用例结果保留
- 推送钉钉告警（通过 Story 5.4 的通知服务）

**Given** 计划处于「已暂停」状态
**When** 用户点击"恢复"
**Then**
- `POST /api/plans/{id}/resume` 执行
- 从暂停点继续执行剩余用例

**Given** 计划处于「已暂停」状态
**When** 用户点击"终止"
**Then**
- `POST /api/plans/{id}/abort` 执行
- 计划状态变为「已完成」
- 未执行用例标记为「未执行」

**Given** 同项目同测试类型的自动化计划同时触发
**When** 第二个计划执行
**Then**
- 第二个计划进入执行队列排队（不同项目可并行）
- 计划列表显示队列状态（等待中 / 第 N 位）
- 手动计划无队列限制

### Story 4.7: 计划重新打开与计划归档

As a 项目管理员或计划创建者,
I want 重新打开已完成的计划（补充录入或重新执行），以及归档不再使用的计划,
So that 计划生命周期管理灵活完整。

**关联需求：** FR-PLAN-009, FR-PLAN-006

**验收标准：**

**Given** 计划状态为「已完成」
**When** 项目管理员或计划创建者点击"重新打开"
**Then**
- `POST /api/plans/{id}/reopen`（重用 execute 端点或新增）
- 计划状态变为「执行中」
- 已有用例执行结果保留不变
- 可继续补充录入手动用例结果

**Given** 非项目管理员且非计划创建者
**When** 尝试重新打开计划
**Then** 返回 403 错误

**Given** 计划状态为「已完成」
**When** 点击"归档"
**Then**
- 计划状态变为「已归档」
- 只读，不可再执行
- 历史执行记录保留

**Given** 重新打开或归档操作
**When** 操作执行
**Then** 操作记录到审计日志

---

## Epic 5: 报告与通知

**目标：** 实现四层渐进下钻报告视图、失败详情三层展示、HTML/Excel 异步导出、钉钉通知推送，使测试结果的查看、分析和分享完整可用。

### Story 5.1: 报告仪表盘（L1 整体汇总 + L2 模块分组）

As a 项目成员,
I want 在计划详情页查看执行报告，包括整体汇总（通过率、各状态计数）和按模块分组的通过率,
So that 我可以快速了解测试执行的整体情况和各模块质量状况。

**关联需求：** FR-REPORT-001

**验收标准：**

**Given** 用户进入已执行的计划详情页
**When** 报告 Tab 加载
**Then**
- `GET /api/plans/{planId}/report` 返回 L1 + L2 数据
- L1 整体视图展示：总数、通过数、失败数、跳过数、手动录入数、通过率（环形图）、执行时长
- 通过率 = passed / (passed + failed + error + flaky) * 100，分母为 0 时显示 "-"
- L2 模块视图：按模块分组汇总通过率，以列表或卡片形式展示

**Given** 报告数据量 500 条用例
**When** 页面加载
**Then** 报告页加载 < 3 秒（P95）

**Given** 报告中包含自动和手动结果
**When** 查看用例列表
**Then** 每条用例显示执行状态 + 来源（自动/手动）+ 处理人

### Story 5.2: 报告下钻（L3 场景步骤 + L4 请求/响应详情）

As a 测试人员,
I want 在报告中点击某个用例展开查看步骤执行详情，点击某步骤查看 API 请求/响应原始数据,
So that 我可以精确定位失败原因。

**关联需求：** FR-REPORT-001, FR-REPORT-004

**验收标准：**

**Given** 用户在报告用例列表点击某条用例
**When** 展开该用例
**Then**
- `GET /api/reports/{id}/scenarios/{sid}/steps` 懒加载 L3 步骤数据
- 展示步骤清单：每步序号 + 操作描述 + 状态 + 耗时
- 失败步骤红色高亮

**Given** 用户点击某个步骤
**When** 展开详情面板
**Then**
- `GET /api/reports/{id}/steps/{stepId}/detail` 懒加载 L4 数据
- 展示：HTTP 方法 + 完整 URL + 状态码 + 请求体 + 响应体 + 耗时
- 断言详情：expression + expected + actual + passed/failed

**Given** 失败的自动化用例
**When** 点击展开
**Then** 严格按三层展示：
- 第一层（失败摘要，默认展示）：失败步骤序号 + 步骤描述 + 一句话失败原因
- 第二层（执行证据，默认展开）：步骤清单 + E2E 失败截图（缩略图，可点击放大）+ API 请求详情
- 第三层（原始堆栈，默认折叠）：pytest 完整错误堆栈，折叠按钮"展开技术细节"

**Given** 失败的手动用例
**When** 点击展开
**Then** 仅显示测试人员备注，无三层结构

**Given** 缺少步骤级日志的旧脚本
**When** 查看失败详情
**Then** 仅显示第三层原始堆栈

**Given** 详情面板中有截图
**When** 页面渲染
**Then** 截图懒加载，点击展开时才加载完整图片

### Story 5.3: 失败详情三层展示

As a 测试人员,
I want 失败用例按三层递进展示（摘要→证据→堆栈），避免一次性堆砌技术信息,
So that 我可以从业务视角快速理解失败原因，需要时再深入技术细节。

**关联需求：** FR-REPORT-004

**验收标准：**

**Given** 自动化失败用例在报告中展开
**When** 渲染失败详情
**Then**
- 第一层（失败摘要）始终显示：
  - 失败步骤序号 + 步骤描述（如"第 3 步 - 点击「登录」按钮"）
  - 一句话失败原因（如"预期跳转到 /dashboard，实际停留在 /login"）
- 第二层（执行证据）默认展开：
  - 每步状态标记（通过/失败/跳过 对应图标）+ 耗时
  - E2E 失败截图缩略图，可点击放大
  - API 步骤：方法 + URL + 状态码 + 请求体 + 响应体 + 耗时
- 第三层（原始堆栈）默认折叠：
  - "展开技术细节"按钮
  - pytest 完整错误堆栈（等宽字体，语法高亮）

**Given** 手动失败用例
**When** 查看失败详情
**Then** 仅展示测试人员录入的备注文本，无三层结构

**Given** 旧脚本（无步骤级 JSON）
**When** 查看失败详情
**Then** 第一层显示"无步骤信息"，跳过第二层，直接展示第三层堆栈

### Story 5.4: HTML/Excel 异步导出与钉钉通知

As a 测试人员,
I want 导出 HTML 和 Excel 格式的测试报告，在自动化执行完成和熔断时收到钉钉通知,
So that 我可以分享报告给团队，并及时得知执行状态。

**关联需求：** FR-REPORT-002, FR-REPORT-003, FR-NOTIF-002

**验收标准：**

**Given** 用户在计划详情页点击"导出 HTML"
**When** `POST /api/reports/{id}/export/html` 触发
**Then**
- 异步任务（arq Worker）生成 HTML 报告
- HTML 自包含（无外部依赖，Jinja2 模板），可离线浏览
- 包含整体、模块、用例三层数据 + 失败详情
- 500 条用例导出 < 30 秒
- 返回 202，前端通过 `GET /api/tasks/{taskId}/status` 轮询状态
- 完成后提供下载链接

**Given** 用户在计划详情页点击"导出 Excel"
**When** `POST /api/reports/{id}/export/excel` 触发
**Then**
- 异步任务生成 Excel 报告（openpyxl）
- 包含用例 ID、标题、模块、状态、错误摘要、执行时长
- 500 条用例导出 < 15 秒

**Given** 自动化计划执行完成（所有自动化用例执行结束）
**When** 计划配置了钉钉通知渠道
**Then**
- 向选定渠道发送钉钉消息卡片
- 内容：触发场景（执行完成）、计划名、项目名、环境、总用例数、通过数、失败数、跳过数、执行时间、报告跳转链接
- 推送延迟 < 30 秒

**Given** 自动化计划因熔断暂停
**When** 计划配置了钉钉通知渠道
**Then**
- 发送熔断告警消息卡片
- 内容同上，触发场景为"熔断"
- 同一事件不重复发送

**Given** 钉钉推送失败（网络异常等）
**When** httpx 请求失败
**Then**
- 使用 tenacity 重试（最多 3 次）
- 最终失败记录日志，不阻塞计划状态变更

**Given** 手动计划
**When** 完成执行
**Then** 不发送任何钉钉通知

---

## Epic 6: 审计与运维

**目标：** 实现操作日志的完整记录与查询能力，以及系统健康检查端点，确保平台可审计、可监控。

### Story 6.1: 审计日志记录与查询

As a 系统管理员或项目成员,
I want 查看所有关键操作的审计日志，支持按操作人、时间范围、操作类型筛选,
So that 我可以追溯任何操作的执行人和执行时间，满足审计要求。

**关联需求：** FR-LOG-001, FR-LOG-002, NFR-SEC-005

**验收标准：**

**Given** 任何用户执行写操作（创建/修改/删除/导入/执行/归档等）
**When** 操作完成
**Then**
- `audit_logs` 表自动记录一条日志
- 日志字段：操作人（user_id）、时间（created_at，精确到秒）、操作类型（action）、对象类型（target_type）、对象 ID（target_id）、对象名称（target_name）、变更摘要（changes JSONB）、trace_id
- 敏感字段（如 Webhook URL）不记录原值
- 日志仅追加，不可更新和删除（NFR-SEC-005）

**Given** 审计日志通过装饰器 `@audit_log` 自动记录
**When** 新增 API 端点需要审计
**Then** 只需在 service 方法上添加 `@audit_log(action="create", target_type="plan")` 即可

**Given** 系统管理员访问日志查询页面
**When** 查看日志
**Then**
- `GET /api/logs` 返回全局日志（仅 admin）
- `GET /api/projects/{id}/logs` 返回项目级日志
- 支持筛选：操作人、时间范围、操作类型
- 支持关键字搜索（对象名称）
- 默认显示最近 7 天，分页加载

**Given** 非系统管理员用户
**When** 查看日志
**Then** 仅能看到所属项目的日志

**Given** 审计日志保留策略
**When** 日志写入
**Then** 日志保留 >= 3 年（NFR-DATA-003 要求 >= 1 年，PRD FR-LOG-001 要求 >= 3 年，取更严格值）

**记录范围覆盖清单：**
- 用户：创建、修改、删除、绑定项目
- 项目：创建、修改配置
- 分支配置：创建、归档、恢复
- 用例管理：创建、修改、删除、导入、归档、Flaky 标记、更新脚本、更新用例
- 计划：创建、执行、暂停恢复、终止、归档、重新打开、手动录入结果
- 配置：环境、全局变量、通知渠道变更

### Story 6.2: 健康检查端点与系统监控

As a 运维人员,
I want 通过健康检查端点监控平台和各组件的运行状态,
So that 我可以及时发现和响应系统异常。

**验收标准：**

**Given** 运维人员或监控系统访问存活探针
**When** `GET /api/healthz`
**Then**
- 返回 `{"status": "ok"}`
- 无需鉴权
- 仅检查 FastAPI 进程存活

**Given** 运维人员或监控系统访问就绪探针
**When** `GET /api/readyz`
**Then**
- 检查数据库连接是否正常
- 检查 Redis 连接是否正常
- 检查 arq Worker 心跳是否正常
- 检查磁盘空间是否充足（低于阈值返回 503，拒绝新执行任务）
- 返回各组件状态详情：`{"status": "ok", "components": {"db": "ok", "redis": "ok", "worker": "ok", "disk": "ok"}}`

**Given** 数据库连接异常
**When** 访问 `/api/readyz`
**Then** 返回 503，`{"status": "degraded", "components": {"db": "error", ...}}`

**Given** Redis 服务不可用
**When** 平台运行
**Then** 基本读写功能不受影响（NFR-AVAIL-003），仅任务队列受影响

---

*生成时间：2026-04-15 -- Epic 拆分 v1.0*
