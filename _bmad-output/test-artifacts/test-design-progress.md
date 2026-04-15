---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-04-15'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/implementation-artifacts/sprint-status.yaml
  - _bmad-output/implementation-artifacts/1-1-backend-scaffold-and-user-table.md
  - knowledge/risk-governance.md
  - knowledge/probability-impact.md
  - knowledge/test-levels-framework.md
  - knowledge/test-priorities-matrix.md
---

## Step 1: 模式检测与前置条件

**模式：** Epic-Level 测试设计

**检测依据：**
- sprint-status.yaml 存在，Epic 1 in-progress
- 文件路径：`_bmad-output/implementation-artifacts/sprint-status.yaml`

**前置条件：**
- [x] Epic/Story 需求 + 验收标准（epics.md，6 Epic / 28 Story）
- [x] 架构上下文（architecture.md，Step 1-5）
- [x] PRD（prd.md v3.5，42 条 FR）

**目标 Epic：** Epic 1 — 项目基础与用户体系（6 Stories，当前 in-progress）

---

## Step 2: 加载上下文与知识库

### 2.1 配置加载

| 配置项 | 值 |
|--------|---|
| tea_use_playwright_utils | true |
| tea_use_pactjs_utils | false |
| tea_pact_mcp | none |
| tea_browser_automation | auto |
| test_stack_type | auto → **fullstack**（检测到 pyproject.toml + package.json with React） |
| test_framework | auto |
| communication_language | 中文 |
| risk_threshold | p1 |
| test_artifacts | _bmad-output/test-artifacts |

### 2.2 技术栈检测

- **后端指标：** `backend/pyproject.toml`（FastAPI + SQLAlchemy + asyncpg）
- **前端指标：** `frontend/package.json`（React 19 + Ant Design + Vite）
- **检测结果：** `fullstack`
- **Playwright Utils 加载配置：** API-only（项目无 page.goto/page.locator 测试文件）

### 2.3 项目产物加载（Epic-Level）

| 产物 | 路径 | 用途 |
|------|------|------|
| Epic/Story 需求 | epics.md | 6 Epic / 28 Story，详细验收标准 |
| PRD | prd.md v3.5 | 42 条 FR + NFR + 用户旅程 |
| 架构文档 | architecture.md | Step 1-5，DB Schema，50+ API 端点 |
| Sprint 状态 | sprint-status.yaml | Epic 1 in-progress，Story 1.1 in-progress |
| Story 1.1 实现文档 | 1-1-backend-scaffold-and-user-table.md | 后端脚手架实现细节 |

### 2.4 提取的可测试需求（Epic 1）

**Story 1.1：后端脚手架与用户表**
- FastAPI 启动 + GET /api/healthz
- PostgreSQL 连接 + Alembic 迁移
- users 表 + admin 种子数据
- bcrypt 密码加密（cost >= 10）
- 统一异常体系 + CamelCase 响应

**Story 1.2：登录页与 JWT 认证**
- POST /api/auth/login → JWT token（8h 有效期）
- 滑动续期（剩余 <2h 返回 X-New-Token）
- GET /api/auth/me 返回当前用户
- 未登录重定向 /login
- 错误提示不泄露字段

**Story 1.3：用户 CRUD**
- POST/PUT/DELETE /api/users
- 用户名唯一，密码 bcrypt
- 非 admin 返回 403

**Story 1.4：项目 CRUD**
- POST /api/projects（名称唯一，Git 地址校验）
- 自动创建默认分支配置
- 成员列表含创建者

**Story 1.5：项目成员管理**
- 添加/修改/移除项目成员
- 同一用户不可重复绑定
- 至少保留一个管理员

**Story 1.6：RBAC 权限体系**
- 系统级（admin/user）+ 项目级（project_admin/developer/tester/guest）
- 装饰器 @require_role() / @require_project_role()
- 游客写操作返回 403

### 2.5 集成点

- FastAPI ↔ PostgreSQL（SQLAlchemy async + asyncpg）
- FastAPI ↔ Redis（arq，后续 Epic）
- JWT token ↔ 前端 Authorization header
- bcrypt ↔ 密码验证
- Alembic ↔ 数据库迁移

### 2.6 已有测试覆盖

- **项目测试：** ❌ 无（`backend/tests/` 目录不存在）
- **已有模式：** 无 conftest.py、无 pytest 配置
- **覆盖缺口：** 全部 — 整个项目零测试

### 2.7 知识片段加载

**Core tier（已加载）：**
- risk-governance.md — 风险评分矩阵、门控决策
- probability-impact.md — 概率×影响评估标尺
- test-levels-framework.md — 单元/集成/E2E 测试级别选择
- test-priorities-matrix.md — P0-P3 优先级定义

---

## Step 3: 风险与可测试性评估

### 3.1 风险评估矩阵（Epic 1）

| ID | 类别 | 风险标题 | 概率 | 影响 | 分数 | 行动 |
|----|------|---------|------|------|------|------|
| R-1.1 | SEC | JWT token 被窃取或伪造，绕过认证 | 2 | 3 | **6** | MITIGATE |
| R-1.2 | SEC | RBAC 权限装饰器遗漏，非授权用户可执行写操作 | 3 | 3 | **9** | **BLOCK** |
| R-1.3 | SEC | 登录错误信息泄露用户名是否存在 | 2 | 2 | 4 | MONITOR |
| R-1.4 | SEC | 密码 bcrypt cost 不足或明文日志 | 1 | 3 | 3 | DOCUMENT |
| R-1.5 | DATA | 用户名唯一约束竞态条件 | 2 | 2 | 4 | MONITOR |
| R-1.6 | DATA | 删除用户时项目绑定未解除，孤立数据 | 2 | 3 | **6** | MITIGATE |
| R-1.7 | BUS | 最后一个项目管理员被删除，项目无法管理 | 3 | 2 | **6** | MITIGATE |
| R-1.8 | TECH | JWT 滑动续期逻辑错误 | 2 | 2 | 4 | MONITOR |
| R-1.9 | TECH | CamelCase 中间件转换丢失或错乱字段 | 2 | 2 | 4 | MONITOR |
| R-1.10 | BUS | 项目创建时默认分支配置未自动生成 | 2 | 2 | 4 | MONITOR |
| R-1.11 | SEC | Token 过期后仍可访问受保护资源 | 2 | 3 | **6** | MITIGATE |
| R-1.12 | OPS | Alembic 迁移失败导致数据库不一致 | 1 | 3 | 3 | DOCUMENT |

### 3.2 风险分布

- **BLOCK（分数=9）：** 1 项 — R-1.2 RBAC 权限遗漏
- **MITIGATE（分数 6-8）：** 4 项 — R-1.1, R-1.6, R-1.7, R-1.11
- **MONITOR（分数 4-5）：** 5 项
- **DOCUMENT（分数 1-3）：** 2 项

### 3.3 缓解优先级

1. **R-1.2（BLOCK）：** 每个 API 端点必须有权限测试覆盖，RBAC 装饰器遗漏 = 发布阻断
2. **R-1.1 + R-1.11（MITIGATE）：** JWT 全生命周期测试（签发/验证/过期/续期/无效）
3. **R-1.6（MITIGATE）：** 用户删除级联测试，验证绑定关系正确清理
4. **R-1.7（MITIGATE）：** 最后管理员保护测试，验证返回 422
