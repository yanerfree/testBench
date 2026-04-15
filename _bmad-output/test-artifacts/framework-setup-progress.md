---
stepsCompleted: ['step-01-preflight', 'step-02-select-framework', 'step-03-scaffold-framework', 'step-04-docs-and-scripts', 'step-05-validate-and-summary']
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-04-15'
---

## Step 1: 预检

**检测结果：** fullstack（backend: pyproject.toml, frontend: package.json）

**前置条件：** 全部通过
- [x] 后端 pyproject.toml 存在
- [x] 前端 package.json 存在
- [x] 无已有 E2E 框架
- [x] 无已有后端测试框架
- [x] 架构文档可用

**项目上下文：**
- 后端：FastAPI + SQLAlchemy async + asyncpg + pytest
- 前端：React 19 + Ant Design 6 + Vite 8
- 数据库：PostgreSQL 13+
- 认证：JWT（计划中）
- 测试目录：项目根 `tests/`（不在 backend/ 下）
- pytest 配置：项目根 `pyproject.toml`
- 目录结构：`tests/{unit|integration|api|e2e}/{module}/test_{slug}.py`
