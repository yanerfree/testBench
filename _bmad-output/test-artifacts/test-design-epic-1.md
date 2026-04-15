---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-04-15'
---

# Test Design: Epic 1 - 项目基础与用户体系

**Date:** 2026-04-15
**Author:** Dreamer
**Status:** Draft

---

## Executive Summary

**Scope:** Epic-Level 测试设计 for Epic 1

**Risk Summary:**

- Total risks identified: 12
- High-priority risks (≥6): 5
- Critical categories: SEC (4), DATA (1), BUS (1)

**Coverage Summary:**

- P0 scenarios: 22 (~15-25 hours)
- P1 scenarios: 14 (~8-15 hours)
- P2/P3 scenarios: 3 (~2-4 hours)
- **Total effort**: ~25-44 hours (~4-6 days)

---

## Not in Scope

| Item | Reasoning | Mitigation |
|------|-----------|------------|
| **前端 UI 测试** | 前端使用 Mock 数据，无后端集成 | 等后端 API 就绪后 Epic 2+ 增加 E2E |
| **性能压测** | Epic 1 为基础功能，NFR-PERF 在后续 Epic 验证 | Nightly 中增加基础性能检查 |
| **钉钉通知** | 属于 Epic 5，不在 Epic 1 范围 | Epic 5 测试计划覆盖 |
| **执行引擎** | 属于 Epic 4 | 单独测试计划 |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---------|----------|-------------|-------------|--------|-------|------------|-------|----------|
| R-1.2 | SEC | RBAC 权限装饰器遗漏，非授权用户可执行写操作 | 3 | 3 | **9** | 每个 API 端点必须有权限测试；CI 中 RBAC 测试 100% 通过才可合并 | 开发 | Epic 1 完成前 |
| R-1.1 | SEC | JWT token 被窃取或伪造，绕过认证 | 2 | 3 | **6** | 测试 token 签名验证、过期拒绝、无效 token 返回 401 | 开发 | Story 1.2 |
| R-1.6 | DATA | 删除用户时项目绑定未解除，产生孤立数据 | 2 | 3 | **6** | 集成测试验证级联解除绑定 | 开发 | Story 1.3 |
| R-1.7 | BUS | 最后一个项目管理员被删除，项目无法管理 | 3 | 2 | **6** | 测试删除最后管理员时返回 422 | 开发 | Story 1.5 |
| R-1.11 | SEC | Token 过期后仍可访问受保护资源 | 2 | 3 | **6** | 测试过期 token 返回 401 | 开发 | Story 1.2 |

### Medium-Priority Risks (Score 4-5)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
|---------|----------|-------------|-------------|--------|-------|------------|-------|
| R-1.3 | SEC | 登录错误信息泄露用户名是否存在 | 2 | 2 | 4 | 验证错误/不存在用户名返回相同提示 | 开发 |
| R-1.5 | DATA | 用户名唯一约束竞态条件 | 2 | 2 | 4 | 数据库唯一约束 + 409 测试 | 开发 |
| R-1.8 | TECH | JWT 滑动续期逻辑错误 | 2 | 2 | 4 | 测试 X-New-Token 响应头 | 开发 |
| R-1.9 | TECH | CamelCase 中间件转换丢失字段 | 2 | 2 | 4 | 单元测试覆盖嵌套对象转换 | 开发 |
| R-1.10 | BUS | 项目创建时默认分支配置未自动生成 | 2 | 2 | 4 | 集成测试验证默认分支创建 | 开发 |

### Low-Priority Risks (Score 1-3)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
|---------|----------|-------------|-------------|--------|-------|--------|
| R-1.4 | SEC | 密码 bcrypt cost 不足或明文日志 | 1 | 3 | 3 | Document |
| R-1.12 | OPS | Alembic 迁移失败导致数据库不一致 | 1 | 3 | 3 | Document |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## Entry Criteria

- [x] Epic 1 Story 需求和验收标准已确认（epics.md）
- [ ] 测试环境 PostgreSQL 已部署
- [ ] pytest + httpx + factory 依赖已安装
- [ ] 后端 FastAPI 服务可启动（Story 1.1 ✅）
- [ ] 数据库迁移已运行（Alembic ✅）

## Exit Criteria

- [ ] 全部 P0 测试通过
- [ ] 全部 P1 测试通过（或失败已分类处理）
- [ ] 无 BLOCK 风险（R-1.2）处于 OPEN 状态
- [ ] RBAC 每个端点至少一条权限测试
- [ ] 代码覆盖率 ≥ 80%（auth/permissions 模块 ≥ 90%）

---

## Test Coverage Plan

### P0 (Critical) - Run on every commit

**Criteria**: Blocks core journey + High risk (≥6) + No workaround

| ID | Requirement | Test Level | Risk Link | Notes |
|----|-------------|-----------|-----------|-------|
| 1.1-UNIT-001 | bcrypt hash 生成 + 验证一致性 | Unit | R-1.4 | cost >= 10 验证 |
| 1.2-INT-001 | 正确凭据 → 返回 JWT token | API | R-1.1 | 验证 token 格式和内容 |
| 1.2-INT-002 | 错误密码 → "用户名或密码错误" | API | R-1.3 | 不泄露字段 |
| 1.2-INT-003 | 不存在用户名 → 同样提示 | API | R-1.3 | 与 INT-002 返回一致 |
| 1.2-INT-004 | 停用账号 → 拒绝登录 | API | R-1.1 | is_active=false |
| 1.2-INT-005 | 过期 Token → 401 | API | R-1.11 | 构造过期 token |
| 1.2-INT-006 | 无效/篡改 Token → 401 | API | R-1.1 | 签名验证 |
| 1.2-INT-009 | 无 Token → 401 | API | R-1.11 | 所有受保护端点 |
| 1.3-INT-001 | admin 创建用户，密码 bcrypt 存储 | API | R-1.4 | 验证非明文 |
| 1.3-INT-002 | 用户名重复 → 409 | API | R-1.5 | 唯一约束 |
| 1.3-INT-004 | 删除用户 → 项目绑定自动解除 | API | R-1.6 | 级联验证 |
| 1.3-INT-005 | 非 admin 访问用户管理 → 403 | API | R-1.2 | RBAC |
| 1.4-INT-001 | 创建项目 + 默认分支配置自动生成 | API | R-1.10 | 验证 branches 表 |
| 1.4-INT-005 | admin 看全部项目，普通用户看绑定项目 | API | R-1.2 | 数据隔离 |
| 1.5-INT-004 | 移除成员 → 立即失去访问权 | API | R-1.2 | 验证后续请求 403 |
| 1.5-INT-005 | 删除最后项目管理员 → 422 | API | R-1.7 | 保护机制 |
| 1.5-INT-006 | 非管理员操作成员 → 403 | API | R-1.2 | RBAC |
| 1.6-INT-001 | admin 可访问所有项目 | API | R-1.2 | 全局权限 |
| 1.6-INT-002 | 非绑定用户访问项目 → 403 | API | R-1.2 | 项目隔离 |
| 1.6-INT-003 | project_admin 可改配置+成员 | API | R-1.2 | 项目级权限 |
| 1.6-INT-004 | developer/tester 不可改项目配置 | API | R-1.2 | 写操作限制 |
| 1.6-INT-005 | guest 所有写操作 → 403 | API | R-1.2 | 只读角色 |

**Total P0**: 22 tests, ~15-25 hours

### P1 (High) - Run on PR to main

**Criteria**: Important features + Medium risk + Common workflows

| ID | Requirement | Test Level | Risk Link | Notes |
|----|-------------|-----------|-----------|-------|
| 1.1-INT-001 | GET /api/healthz 返回 ok | API | — | 存活探针 |
| 1.1-INT-002 | 数据库连接池正常获取/释放 | API | R-1.12 | 连接泄漏检查 |
| 1.1-INT-003 | admin 种子数据幂等创建 | API | — | 重复执行不报错 |
| 1.1-UNIT-002 | CamelCase 中间件 snake→camel | Unit | R-1.9 | 嵌套对象 |
| 1.1-UNIT-003 | 异常体系返回正确状态码 | Unit | — | 4 种异常类型 |
| 1.2-INT-007 | 滑动续期 X-New-Token | API | R-1.8 | 剩余 <2h |
| 1.2-INT-008 | GET /api/auth/me 返回用户信息 | API | — | 字段完整 |
| 1.3-INT-003 | 修改用户角色/激活状态 | API | — | 状态变更 |
| 1.3-INT-006 | 密码最小长度校验 | API | — | 输入验证 |
| 1.4-INT-002 | 项目名称重复 → 409 | API | — | 唯一约束 |
| 1.4-INT-003 | Git 地址格式校验 | API | — | git@ 和 https:// |
| 1.4-INT-004 | 成员列表自动包含创建者 | API | — | 自动添加 |
| 1.5-INT-001 | 添加成员 + 指定项目级角色 | API | — | 角色分配 |
| 1.5-INT-002 | 重复绑定同一项目 → 拒绝 | API | — | 去重 |

**Total P1**: 14 tests, ~8-15 hours

### P2 (Medium) - Run nightly

**Criteria**: Secondary features + Low risk + Edge cases

| ID | Requirement | Test Level | Risk Link | Notes |
|----|-------------|-----------|-----------|-------|
| 1.4-INT-006 | 修改 Git 地址成功 | API | — | 编辑功能 |
| 1.5-INT-003 | 修改成员角色成功 | API | — | 角色变更 |
| 1.6-UNIT-006 | @require_role 装饰器单元测试 | Unit | R-1.2 | 装饰器逻辑 |

**Total P2**: 3 tests, ~2-4 hours

---

## Execution Order

### Smoke Tests (<1 min)

- [ ] GET /api/healthz → 200 (30s)
- [ ] POST /api/auth/login 成功 → token (30s)

**Total**: 2 scenarios

### P0 Tests (<5 min)

- [ ] JWT 认证全生命周期（签发/验证/过期/续期/无效）
- [ ] 用户 CRUD + 唯一约束 + 级联删除
- [ ] 项目 CRUD + 默认分支 + 数据隔离
- [ ] 成员管理 + 最后管理员保护
- [ ] RBAC 5 角色全覆盖

**Total**: 22 scenarios

### P1 Tests (<3 min)

- [ ] 健康检查 + 数据库连接 + 种子数据
- [ ] CamelCase + 异常体系
- [ ] 滑动续期 + 用户信息
- [ ] 输入校验 + 格式验证

**Total**: 14 scenarios

### P2 Tests (<2 min)

- [ ] 编辑功能 + 装饰器单元测试

**Total**: 3 scenarios

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
|----------|-------|-----------|-------------|-------|
| P0 | 22 | ~0.7-1.1 | ~15-25 | 安全/权限场景需精细设计 |
| P1 | 14 | ~0.6-1.0 | ~8-15 | 标准 API 测试 |
| P2 | 3 | ~0.7-1.3 | ~2-4 | 简单场景 |
| **Total** | **39** | **—** | **~25-44** | **~4-6 days** |

### Prerequisites

**Test Data:**

- UserFactory（faker 生成用户名/密码，自动清理）
- ProjectFactory（faker 生成项目名/Git 地址）
- MemberFactory（用户+项目绑定）

**Tooling:**

- pytest + pytest-asyncio（异步测试）
- httpx（API Integration 测试客户端）
- factory-boy 或自定义 fixture（数据工厂）

**Environment:**

- PostgreSQL 测试数据库（每次测试事务回滚）
- FastAPI TestClient（httpx.AsyncClient）

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2/P3 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Critical paths (auth/permissions)**: ≥90%
- **Business logic (CRUD)**: ≥80%
- **Edge cases**: ≥60%
- **Security scenarios**: 100%

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No BLOCK risk (R-1.2) in OPEN status
- [ ] Security tests (SEC category) pass 100%
- [ ] Every API endpoint has at least one RBAC test

---

## Mitigation Plans

### R-1.2: RBAC 权限装饰器遗漏 (Score: 9)

**Mitigation Strategy:** 每个 API 端点必须有对应的权限测试；CI pipeline 中 RBAC 测试集 100% 通过才允许合并。代码审查时检查新增端点是否有 @require_role 或 @require_project_role 装饰器。
**Owner:** 开发团队
**Timeline:** 随每个 Story 同步完成
**Status:** Planned
**Verification:** RBAC 测试覆盖矩阵（角色 × 端点）无空白

### R-1.1: JWT Token 安全 (Score: 6)

**Mitigation Strategy:** 测试 JWT 全生命周期：签发、验证、过期、续期、篡改。使用固定 secret 的测试环境，构造各类边界 token。
**Owner:** 开发
**Timeline:** Story 1.2 完成时
**Status:** Planned
**Verification:** 6 个 JWT 相关 P0 测试全部通过

### R-1.6: 用户删除级联 (Score: 6)

**Mitigation Strategy:** 集成测试验证删除用户后 project_members 表无孤立记录。
**Owner:** 开发
**Timeline:** Story 1.3 完成时
**Status:** Planned
**Verification:** 1.3-INT-004 通过

### R-1.7: 最后管理员保护 (Score: 6)

**Mitigation Strategy:** 测试删除最后一个 project_admin 时返回 422 且成员未被删除。
**Owner:** 开发
**Timeline:** Story 1.5 完成时
**Status:** Planned
**Verification:** 1.5-INT-005 通过

### R-1.11: Token 过期访问 (Score: 6)

**Mitigation Strategy:** 构造已过期 token 访问受保护资源，验证返回 401。
**Owner:** 开发
**Timeline:** Story 1.2 完成时
**Status:** Planned
**Verification:** 1.2-INT-005 通过

---

## Assumptions and Dependencies

### Assumptions

1. 后端 FastAPI 服务可正常启动（Story 1.1 ✅）
2. PostgreSQL 测试数据库可用，支持事务回滚隔离
3. JWT secret 在测试环境中使用固定值
4. 测试不依赖外部服务（Redis、Git 等属于后续 Epic）

### Dependencies

1. PostgreSQL 数据库 — 测试前需可用
2. Alembic 迁移 — 测试前需运行完成
3. Story 1.1 后端脚手架 — 已完成 ✅

### Risks to Plan

- **Risk**: PostgreSQL 测试环境不稳定
  - **Impact**: 集成测试间歇性失败
  - **Contingency**: 使用 Docker 容器化测试数据库

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
|-------------------|--------|-----------------|
| **FastAPI 中间件** | CamelCase 转换影响所有 API 响应 | 1.1-UNIT-002 |
| **JWT 认证** | 影响所有受保护端点 | 1.2-INT-* 全部 |
| **RBAC 装饰器** | 影响所有写操作端点 | 1.6-INT-* 全部 |

---

## Follow-on Workflows (Manual)

- Run `*atdd` to generate failing P0 tests (separate workflow; not auto-run).
- Run `*automate` for broader coverage once implementation exists.
- Run `*framework` to initialize test directory structure and conftest.py.

---

## Appendix

### Knowledge Base References

- `risk-governance.md` - Risk classification framework
- `probability-impact.md` - Risk scoring methodology
- `test-levels-framework.md` - Test level selection
- `test-priorities-matrix.md` - P0-P3 prioritization

### Related Documents

- PRD: `_bmad-output/planning-artifacts/prd.md` (v3.5)
- Epic: `_bmad-output/planning-artifacts/epics.md` (Epic 1)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (Step 1-5)
- Sprint Status: `_bmad-output/implementation-artifacts/sprint-status.yaml`

---

**Generated by**: BMad TEA Agent - Test Architect Module
**Workflow**: `bmad-testarch-test-design`
**Version**: 4.0 (BMad v6)
