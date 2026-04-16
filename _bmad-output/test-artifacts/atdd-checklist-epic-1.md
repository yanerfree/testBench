---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-04-16'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/test-artifacts/test-design-epic-1.md
  - tests/conftest.py
  - tests/factories.py
  - pyproject.toml
  - knowledge/data-factories.md
  - knowledge/test-quality.md
  - knowledge/test-levels-framework.md
  - knowledge/test-priorities-matrix.md
---

# ATDD Checklist: Epic 1 — 项目基础与用户体系

## Step 1: Preflight & Context Loading

### 1.1 技术栈检测

| 项 | 值 |
|---|---|
| detected_stack | fullstack |
| 前端 | React 19 + Ant Design 6 + Vite 8 |
| 后端 | FastAPI + SQLAlchemy 2 + asyncpg + bcrypt + joserfc |
| 测试框架 | pytest 8+ (async) + httpx + factory-boy |

### 1.2 前置条件检查

| 条件 | 状态 |
|---|---|
| Story 有明确验收标准 (Given/When/Then) | ✅ epics.md 已定义 |
| 后端测试框架 (conftest.py + pytest) | ✅ 已配置 |
| 前端测试框架 (Playwright/Cypress) | ❌ 未配置（Epic 1 不涉及） |
| 开发环境 | ✅ 可用 |

### 1.3 目标 Story 清单

| Story | 名称 | 关键验收点 |
|-------|------|-----------|
| 1.1 | 后端项目脚手架与用户表 | healthz、DB 连接、Alembic 迁移、users 表、bcrypt、异常体系、CamelCase |
| 1.2 | 登录页与 JWT 认证流程 | POST /api/auth/login、JWT 8h、滑动续期、GET /api/auth/me、401 |
| 1.3 | 用户 CRUD 管理 | POST/PUT/DELETE /api/users、用户名唯一 409、非 admin 403 |
| 1.4 | 项目 CRUD | POST /api/projects、默认 branch、项目名唯一 409、Git URL 校验 |
| 1.5 | 项目成员管理 | 添加/修改/移除成员、唯一约束、最后管理员保护 422 |
| 1.6 | RBAC 权限体系 | 两级角色、@require_role / @require_project_role、guest 403 |

### 1.4 已有测试模式

- **测试风格：** Given/When/Then 注释 + pytest class-based
- **Fixtures：** `db_session`（per-test 隔离）、`client`（httpx AsyncClient）
- **工具函数：** `create_test_user()`, `make_auth_headers()` (conftest.py)
- **工厂函数：** `make_user()`, `make_project()`, `make_member()` (factories.py)
- **Pytest markers：** unit, integration, api, e2e
- **已有覆盖：** auth (8 tests), projects (10 tests), users (7 tests), rbac (1 test), health (1 test), unit/auth (2 tests)

### 1.5 TEA 配置

| 配置项 | 值 |
|--------|---|
| tea_use_playwright_utils | true (API-only profile) |
| tea_use_pactjs_utils | false |
| tea_pact_mcp | none |
| tea_browser_automation | auto |
| test_stack_type | auto → fullstack |
| communication_language | 中文 |
| risk_threshold | p1 |

### 1.6 加载的知识片段

**Core tier:**
- data-factories — 工厂函数 + API seeding 模式
- test-quality — 确定性、隔离、显式、聚焦、快速
- test-levels-framework — 单元/集成/E2E 选择指南
- test-priorities-matrix — P0~P3 优先级标准

**Extended tier (backend):**
- ci-burn-in — CI 策略（按需加载）
- test-healing-patterns — 常见失败模式修复（按需加载）

## Step 2: Generation Mode Selection

**选择模式：** AI Generation（AI 生成）

**理由：**
- Epic 1 所有 Story 验收标准为 Given/When/Then 格式，场景类型标准（CRUD、auth、RBAC）
- 后端 API 测试无需浏览器录制
- 项目已有成熟 pytest 测试模式（conftest.py + factories.py）可复用
- 前端 E2E 不在 Epic 1 ATDD 范围内

## Step 3: Test Strategy — 验收标准到测试场景映射

### 测试级别选择原则

| 级别 | 适用场景 | Pytest marker |
|------|---------|---------------|
| Unit | 纯函数、业务逻辑、边界值 | `@pytest.mark.unit` |
| Integration | 数据库交互、中间件、服务调用 | `@pytest.mark.integration` |
| API | 端点验证、请求/响应、完整业务流程 | `@pytest.mark.api` |

### Story 1.1: 后端项目脚手架与用户表

| ID | 测试场景 | 级别 | 优先级 | 验收标准来源 |
|----|---------|------|--------|-------------|
| 1.1-API-001 | GET /api/healthz 返回 {"status": "ok"} | API | P0 | AC-1 |
| 1.1-INT-001 | PostgreSQL 数据库连接成功 | Integration | P0 | AC-3 |
| 1.1-INT-002 | Alembic migration 创建 users 表，字段完整 | Integration | P1 | AC-4 |
| 1.1-INT-003 | 初始 admin 种子数据存在 | Integration | P1 | AC-6 |
| 1.1-UNIT-001 | bcrypt 密码加密 cost >= 10 | Unit | P0 | AC-7 |
| 1.1-API-002 | 统一异常体系：NotFoundError → 404 统一格式 | API | P1 | AC-8,9 |
| 1.1-API-003 | ForbiddenError → 403 统一格式 | API | P1 | AC-8,9 |
| 1.1-API-004 | ConflictError → 409 统一格式 | API | P1 | AC-8,9 |
| 1.1-API-005 | CamelCase 响应：snake_case → camelCase 自动转换 | API | P1 | AC-10 |
| 1.1-API-006 | CORS 中间件 OPTIONS 预检正常 | API | P2 | AC-11 |
| 1.1-API-007 | trace_id 中间件：响应头包含 X-Trace-Id | API | P2 | AC-11 |

### Story 1.2: 登录页与 JWT 认证流程

| ID | 测试场景 | 级别 | 优先级 | 验收标准来源 |
|----|---------|------|--------|-------------|
| 1.2-API-001 | POST /api/auth/login 正确凭据返回 JWT token + 用户信息 | API | P0 | AC-2 |
| 1.2-API-002 | POST /api/auth/login 错误密码返回错误，不泄露字段 | API | P0 | AC-3 |
| 1.2-API-003 | POST /api/auth/login 不存在用户返回相同错误 | API | P0 | AC-3 |
| 1.2-API-004 | POST /api/auth/login 非活跃用户拒绝登录 | API | P1 | 隐含 |
| 1.2-UNIT-001 | JWT token 签发有效期 8h | Unit | P0 | AC-2 |
| 1.2-UNIT-002 | JWT token 解码：有效 token 正确解析 | Unit | P0 | AC-2 |
| 1.2-UNIT-003 | JWT token 解码：过期 token 抛异常 | Unit | P0 | AC-6 |
| 1.2-UNIT-004 | JWT token 解码：无效签名 token 抛异常 | Unit | P0 | AC-6 |
| 1.2-API-005 | GET /api/auth/me 返回当前用户信息 | API | P0 | AC-5 |
| 1.2-API-006 | GET /api/auth/me 未携带 token 返回 401 | API | P0 | AC-6 |
| 1.2-API-007 | GET /api/auth/me 过期 token 返回 401 | API | P0 | AC-6 |
| 1.2-API-008 | 滑动续期：剩余 <2h 返回 X-New-Token | API | P1 | AC-4 |
| 1.2-API-009 | 滑动续期：剩余 >2h 不返回 X-New-Token | API | P2 | AC-4 |
| 1.2-API-010 | POST /api/auth/logout 登出成功 | API | P1 | AC-5b |

### Story 1.3: 用户 CRUD 管理

| ID | 测试场景 | 级别 | 优先级 | 验收标准来源 |
|----|---------|------|--------|-------------|
| 1.3-API-001 | POST /api/users admin 创建用户，密码 bcrypt 加密 | API | P0 | AC-2 |
| 1.3-API-002 | POST /api/users 用户名重复返回 409 | API | P0 | AC-2 |
| 1.3-API-003 | GET /api/users admin 获取用户列表 | API | P1 | AC-1 |
| 1.3-API-004 | PUT /api/users/{id} 修改角色/状态 | API | P1 | AC-3 |
| 1.3-API-005 | DELETE /api/users/{id} 删除用户 | API | P1 | AC-4 |
| 1.3-API-006 | DELETE 已绑定项目用户提示解除绑定 | API | P1 | AC-4 |
| 1.3-API-007 | 非 admin 访问用户管理 API 返回 403 | API | P0 | AC-5 |
| 1.3-API-008 | PUT 用户不存在返回 404 | API | P2 | 边界 |

### Story 1.4: 项目 CRUD

| ID | 测试场景 | 级别 | 优先级 | 验收标准来源 |
|----|---------|------|--------|-------------|
| 1.4-API-001 | POST /api/projects 创建 + 默认 branch + 自动加入成员 | API | P0 | AC-1 |
| 1.4-API-002 | POST /api/projects 项目名重复返回 409 | API | P0 | AC-1 |
| 1.4-API-003 | POST /api/projects Git URL 校验 (ssh + https) | API | P1 | AC-1 |
| 1.4-API-004 | POST /api/projects Git URL 非法返回 422 | API | P1 | AC-1 |
| 1.4-API-005 | GET /api/projects admin 看到全部项目 | API | P0 | AC-2 |
| 1.4-API-006 | GET /api/projects 非 admin 仅看到已绑定项目 | API | P0 | AC-2 |
| 1.4-API-007 | PUT /api/projects/{id} 更新项目 | API | P1 | AC-3 |
| 1.4-API-008 | 非管理员创建/编辑项目返回 403 | API | P0 | AC-4 |

### Story 1.5: 项目成员管理

| ID | 测试场景 | 级别 | 优先级 | 验收标准来源 |
|----|---------|------|--------|-------------|
| 1.5-API-001 | POST 添加成员成功 | API | P0 | AC-1 |
| 1.5-API-002 | POST 同一用户重复绑定返回 409 | API | P1 | AC-1 |
| 1.5-API-003 | PUT 修改成员角色 | API | P1 | AC-2 |
| 1.5-API-004 | DELETE 移除成员成功 | API | P1 | AC-3 |
| 1.5-API-005 | DELETE 移除最后 project_admin 返回 422 | API | P0 | AC-4 |
| 1.5-API-006 | 非管理员添加/移除成员返回 403 | API | P0 | AC-5 |
| 1.5-API-007 | GET 获取成员列表 | API | P1 | AC-1 |

### Story 1.6: RBAC 权限体系

| ID | 测试场景 | 级别 | 优先级 | 验收标准来源 |
|----|---------|------|--------|-------------|
| 1.6-API-001 | admin 可访问所有项目数据 | API | P0 | AC-1 |
| 1.6-API-002 | 非 admin 未绑定项目返回 403 | API | P0 | AC-1 |
| 1.6-API-003 | project_admin 可管理项目配置和成员 | API | P0 | AC-1 |
| 1.6-API-004 | developer 可操作但不可改配置 | API | P1 | AC-1 |
| 1.6-API-005 | tester 可操作但不可改配置 | API | P1 | AC-1 |
| 1.6-API-006 | guest 写操作返回 403 | API | P0 | AC-1 |
| 1.6-API-007 | @require_role 正确拦截系统级权限 | API | P0 | AC-4 |
| 1.6-API-008 | @require_project_role 正确拦截项目级权限 | API | P0 | AC-4 |

### 汇总

| 优先级 | 数量 |
|--------|------|
| P0 | 28 |
| P1 | 21 |
| P2 | 4 |
| **合计** | **53** |

| 测试级别 | 数量 |
|---------|------|
| Unit | 5 |
| Integration | 3 |
| API | 45 |
| **合计** | **53** |

### Red Phase 确认

所有测试设计为实现前失败：遵循 Given/When/Then 模式，与验收标准一一对应。

## Step 4: 测试生成与聚合

### 生成模式

| 项 | 值 |
|---|---|
| 执行模式 | sequential |
| API 测试 | 已生成 (Python/pytest) |
| E2E 测试 | 跳过 (Epic 1 不涉及前端) |
| TDD 阶段 | RED (失败测试) |

### 生成的测试文件

| 文件 | Story | 测试数 | 断言数 |
|------|-------|--------|--------|
| tests/atdd/test_story_1_1_scaffold.py | 1.1 后端脚手架 | 13 | 22 |
| tests/atdd/test_story_1_2_jwt_auth.py | 1.2 JWT 认证 | 17 | 25 |
| tests/atdd/test_story_1_3_user_crud.py | 1.3 用户 CRUD | 12 | 19 |
| tests/atdd/test_story_1_4_project_crud.py | 1.4 项目 CRUD | 9 | 18 |
| tests/atdd/test_story_1_5_project_members.py | 1.5 成员管理 | 9 | 12 |
| tests/atdd/test_story_1_6_rbac.py | 1.6 RBAC 权限 | 16 | 17 |
| **合计** | | **76** | **113** |

### TDD Red Phase 验证

- [x] 所有测试使用真实断言 (非占位符)
- [x] 无 `expect(true)` 占位断言
- [x] 测试覆盖所有验收标准 (Given/When/Then)
- [x] 测试文件已写入 tests/atdd/ 目录

### Fixture 依赖

已有 Fixtures (复用):
- `db_session` — per-test 数据库隔离 (conftest.py)
- `client` — httpx AsyncClient (conftest.py)
- `create_test_user()` — 创建测试用户 (conftest.py)
- `make_auth_headers()` — JWT token headers (conftest.py)

### 下一步 (TDD Green Phase)

实现功能后:
1. 运行 `pytest tests/atdd/ -v` 验证测试通过
2. 测试失败的场景需要:
   - 修复实现 (功能 bug)
   - 或修复测试 (测试 bug)
3. 全部通过后提交

## Step 5: 验证与完成

### 最终验证

| 验证项 | 状态 |
|--------|------|
| 前置条件满足 (Story AC + 测试框架) | ✅ |
| 6 个测试文件正确创建 | ✅ |
| 76 个测试方法 / 44 个测试类 | ✅ |
| 113 个断言，无占位符 | ✅ |
| 覆盖 Epic 1 全部 6 Story 验收标准 | ✅ |
| Given/When/Then 模式 | ✅ |
| 复用已有 conftest.py fixtures | ✅ |
| 输出到 tests/atdd/ 目录 | ✅ |
| checklist 输出到 test-artifacts/ | ✅ |

### 关键假设与风险

1. **已有实现覆盖**: Epic 1 部分功能已实现，ATDD 测试中大部分应可直接通过
2. **数据库 schema 检测**: Story 1.1-INT-002 使用 asyncpg 原生查询检测列信息，需确认测试数据库权限
3. **admin 种子数据**: Story 1.1-INT-003 假设种子数据在测试环境自动创建（若 seed 脚本未自动运行，此测试将失败）
4. **API 路径约定**: 测试中 API 路径基于 epics.md 验收标准，实际实现路径可能略有差异

### 推荐的下一步

| 操作 | 命令 |
|------|------|
| 运行 ATDD 测试 | `pytest tests/atdd/ -v --tb=short` |
| 仅运行 P0 测试 | `pytest tests/atdd/ -v -k "P0"` (需在测试中添加标记) |
| 查看覆盖率 | `pytest tests/atdd/ --cov=backend/app --cov-report=term-missing` |
| 继续实现 | 使用 `bmad-dev-story` 或 `bmad-quick-dev` |
| 扩展测试自动化 | 使用 `bmad-testarch-automate` |
