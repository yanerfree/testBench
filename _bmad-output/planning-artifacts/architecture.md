---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/prd-validation-report.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "_bmad-output/planning-artifacts/change-sync-log.md"
workflowType: 'architecture'
project_name: '测试管理平台'
user_name: 'Dreamer'
date: '2026-04-14'
---

# Architecture Decision Document — 测试管理平台

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### 需求概览

**功能需求：** 35 条 FR，分布 9 个领域

| 领域 | FR 数量 | 关键技术含义 |
|------|---------|------------|
| 项目管理 | 3 | Git 集成、成员 RBAC |
| 模块管理 | 3 | 三级树形结构 |
| 用例管理 | 9 | 万级数据分页/虚拟滚动、JSON 导入解析、批量操作 |
| 环境配置 | 1 | 全局键值对存储、变量优先级注入 |
| 通知渠道 | 2 | 钉钉 Webhook、加密存储 |
| 测试计划 | 8 | 两套状态机（自动/手动）、执行队列、熔断、处理人分配 |
| 执行引擎 | 3 | subprocess 调用 pytest、Git worktree 隔离、JUnit XML + 步骤级 JSON 解析 |
| 报告 | 4 | 四层渐进下钻、三层懒加载 API、HTML/Excel 异步导出 |
| 操作日志 | 2 | 仅追加不可改、保留 ≥ 1 年 |

**非功能需求（架构驱动力）：**

| NFR | 目标值 | 架构影响 |
|-----|--------|---------|
| 用例列表 1000 条 | < 2s (P95) | 数据库索引策略 + 分页查询优化 |
| 报告页加载 | < 3s (P95) | 三层懒加载 API |
| 同时执行自动化计划 | **≥ 20**（调整后） | 任务队列（arq + Redis）+ Worker 池，支持后续多节点扩展 |
| 同时在线用户 | **≥ 200**（调整后） | 单 FastAPI 实例即可，连接池调大 |
| 项目数 | ≥ 100 | — |
| 单项目用例数 | ≥ 10000 | 虚拟滚动 + 数据库分页 |
| 认证安全 | bcrypt + JWT | 认证中间件 + 权限装饰器 |
| 部署环境 | Linux + Windows，无 Docker | pathlib 全程、跨平台脚本 |
| 数据库迁移 | Alembic | schema 版本管理 |
| HTML 导出 500 条 | < 30s | 异步任务队列 |

> **关键调整：** 并发执行从 PRD 的 5 调整为 20，在线用户从 50 调整为 200。架构采用"一期单机多 Worker + 后续多节点线性扩展"策略，不增加一期复杂度。

### 已确认的技术约束

| 约束 | 来源 | 状态 |
|------|------|------|
| React 18 + Ant Design 5 | 原型验证 + 变更清单 | ✅ 已确认 |
| Python FastAPI 后端 | PRD 技术栈 | ✅ 已确认 |
| PostgreSQL 13+ | PRD 技术栈 | ✅ 已确认 |
| Git + worktree 脚本管理 | 三方讨论确认 | ✅ 已确认 |
| pytest 执行引擎 | PRD 技术栈 | ✅ 已确认 |
| arq + Redis 任务队列 | 本次架构讨论确认 | ✅ 已确认 |
| 场景级统计（case_id） | UX 讨论确认 | ✅ 已确认 |
| 6 种状态枚举 | Party Mode 确认 | ✅ 已确认 |
| 环境变量优先级覆盖 | Dreamer 需求 | ✅ 已确认 |
| 手动录入独立页面 | Dreamer 确认 | ✅ 已确认 |
| 马卡龙色系（主色 #6b7ef5） | 原型验证确认 | ✅ 已确认 |

### 规模与复杂度评估

- **项目复杂度：** 中等偏高
- **主技术域：** 全栈 Web 应用 + 本地执行引擎
- **核心技术挑战：** 执行引擎（任务队列 + subprocess + Git worktree + 结果解析）
- **预估架构组件：** ~12 个

### 横切关注点

| 关注点 | 影响范围 | 实现策略 |
|--------|---------|---------|
| RBAC 权限 | 所有 API | 5 级角色 + 项目级隔离，中间件 + 装饰器 |
| 审计日志 | 所有写操作 | 仅追加表，装饰器自动记录 |
| 异步任务 | 脚本执行、报告导出、Git 同步 | arq 任务队列 + Worker 池 |
| 环境变量注入 | 执行引擎 | os.environ 覆盖，平台变量 > 脚本配置 |
| 错误处理 | 全局 | 统一异常体系 + trace_id |

### 扩展性策略

```
一期（单机部署）：
  FastAPI(1) + arq Worker(4-6) + PostgreSQL(1) + Redis(1)
  → 支持 200 用户 + 20 并发执行

后续扩展（多机部署，不改代码）：
  FastAPI(N) + nginx 负载均衡
  arq Worker(M) 部署在多台机器，连同一个 Redis
  PostgreSQL 主从读写分离（按需）
```

## Starter Template & Project Structure

### 前端（已落地）

```bash
npx create-vite frontend --template react
npm install antd @ant-design/icons @ant-design/charts react-router-dom
```

| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| Vite 8 | 构建工具 |
| Ant Design 5 | 组件库（马卡龙色系定制） |
| @ant-design/charts | 环形图等图表 |
| react-router-dom 6 | 路由 |

### 项目仓库结构

```
testBench/                             # 项目根目录
├── frontend/                          # React 前端代码
├── backend/                           # FastAPI 后端代码（见下方详细结构）
├── tests/                             # TEA 生成的测试脚本（测平台自己）
│   ├── api/                           # API 接口测试
│   │   ├── auth/                      #   认证模块
│   │   │   ├── test_login_success.py
│   │   │   ├── test_login_wrong_password.py
│   │   │   └── ...
│   │   ├── cases/                     #   用例管理
│   │   ├── plans/                     #   测试计划
│   │   ├── reports/                   #   报告
│   │   └── environments/              #   环境配置
│   ├── e2e/                           # E2E 业务流程测试
│   │   ├── auth/
│   │   ├── cases/
│   │   └── execution/
│   └── conftest.py                    # 公共 fixtures
├── tea-cases.json                     # TEA 生成的用例清单（平台导入用）
├── pytest.ini
└── requirements.txt
```

> **说明：** `tests/` 和 `tea-cases.json` 由 TEA 生成，和平台代码在同一 Git 仓库同一 commit。
> 平台上线后导入自己的 `tea-cases.json`，管理和执行自己的测试。

### 后端项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI 应用入口
│   ├── config.py                  # 配置管理
│   │
│   ├── deps/                      # 依赖注入（拆分）
│   │   ├── db.py                  # get_db session
│   │   ├── auth.py                # get_current_user + 权限检查
│   │   └── worker.py              # get_arq_pool
│   │
│   ├── api/                       # API 路由层
│   │   ├── auth.py                # 登录/鉴权
│   │   ├── projects.py            # 项目管理
│   │   ├── modules.py             # 模块管理
│   │   ├── cases.py               # 用例管理（含导入/更新）
│   │   ├── environments.py        # 环境配置
│   │   ├── plans.py               # 测试计划
│   │   ├── executions.py          # 执行控制
│   │   ├── reports.py             # 报告查询（三层懒加载）
│   │   └── logs.py                # 操作日志
│   │
│   ├── models/                    # SQLAlchemy ORM 模型
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── module.py
│   │   ├── case.py
│   │   ├── environment.py
│   │   ├── plan.py
│   │   ├── report.py              # reports + scenarios + steps 三表
│   │   └── audit_log.py
│   │
│   ├── schemas/                   # Pydantic 请求/响应模型
│   │   ├── common.py              # 分页、错误、批量操作通用 schema
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── case.py
│   │   ├── plan.py
│   │   ├── report.py
│   │   └── environment.py
│   │
│   ├── services/                  # 业务逻辑层
│   │   ├── auth_service.py
│   │   ├── project_service.py
│   │   ├── case_service.py        # 含 tea-cases.json 导入逻辑
│   │   ├── plan_service.py
│   │   ├── report_service.py
│   │   ├── notification_service.py # 钉钉通知
│   │   ├── git_service.py         # Git clone/pull
│   │   └── worktree_service.py    # Git worktree 创建/清理
│   │
│   ├── engine/                    # 执行引擎
│   │   ├── executor.py            # 编排：worktree→sandbox→subprocess→回收
│   │   ├── sandbox.py             # 隔离环境：worktree checkout + filelock
│   │   ├── command_builder.py     # 构建 pytest 命令行参数（纯函数）
│   │   ├── collector.py           # 产物收集：stdout/junit-xml/step-json
│   │   ├── result_parser.py       # 解析：JUnit XML + step JSON → 内部结构
│   │   └── worker.py              # arq WorkerSettings + 任务注册
│   │
│   └── core/                      # 横切关注点
│       ├── security.py            # JWT（joserfc）+ bcrypt + RBAC
│       ├── permissions.py         # 项目级权限检查逻辑
│       ├── audit.py               # 审计日志装饰器
│       ├── pagination.py          # 通用分页
│       ├── exceptions.py          # 统一异常体系
│       ├── health.py              # /healthz + /readyz + worker 心跳
│       └── middleware.py          # trace_id、CORS
│
├── alembic/                       # 数据库迁移
│   ├── env.py                     # async migration 配置
│   └── versions/
│
├── pyproject.toml
├── alembic.ini
└── .env.example
```

> **注意：** 测试脚本不在 backend/ 下，而在项目根目录 `tests/`（由 TEA 生成）。
```

### 核心依赖

```toml
[dependencies]
fastapi = ">=0.115"
uvicorn = ">=0.30"
sqlalchemy = ">=2.0"
alembic = ">=1.13"
asyncpg = ">=0.29"
pydantic = ">=2.0"
joserfc = ">=1.0"              # JWT（替代已停维的 python-jose）
bcrypt = ">=4.0,<4.1"          # 密码加密（pin 版本避免 passlib 兼容问题）
arq = ">=0.26"                 # 任务队列
redis = ">=5.0"
httpx = ">=0.27"               # 钉钉通知
tenacity = ">=8.2"             # HTTP 重试
openpyxl = ">=3.1"             # Excel 导出
jinja2 = ">=3.1"               # HTML 报告模板
filelock = ">=3.13"            # Git 操作文件锁（单机限制，多机需换 Redis 锁）
```

### TEA 输出规范（上游契约，不可变）

TEA 为测试管理平台生成测试脚本和用例清单，两者在同一 Git 仓库同一 commit 中提交。

**TEA 的职责：**

| 职责 | 具体要求 |
|------|---------|
| 生成脚本 | 放在 `tests/api/` 和 `tests/e2e/` 下，按模块分子目录 |
| 一场景一文件 | 每个测试点独立 `.py` 文件，如 `test_login_success.py` |
| 生成 tea-cases.json | 放仓库根目录，包含所有 API + E2E 用例 |
| tea_id 唯一 | 格式 `{module}_{slug}`，作为平台导入匹配键 |
| script_ref.file | 相对项目根目录的路径，如 `tests/api/auth/test_login_success.py` |
| 执行时输出步骤日志 | 每个 case 输出 `{case_id}.json`，含步骤状态/耗时/请求响应 |
| conftest.py | 公共 fixture（登录 token、DB 清理等）放各层级 conftest |

**固定不可变的约定：**

| 约定 | 变更后果 |
|------|---------|
| tea-cases.json 位置（根目录） | 平台找不到导入文件 |
| tea-cases.json 字段结构 | 平台导入解析失败 |
| tea_id 格式（{module}_{slug}） | 用例匹配错乱 |
| script_ref.file 相对路径 | 执行引擎找不到脚本 |
| 目录结构 tests/{api\|e2e}/{module}/ | conftest 层级断裂 |
| 一场景一文件 | 并发执行隔离失效 |

**两种导入方式：**

| 方式 | 入口 | 流程 | 适用场景 |
|------|------|------|---------|
| 手动导入 | 用例页"导入"按钮 | 上传本地 JSON 文件 → 解析导入 | 快速测试、还没 push |
| Git 更新 | 用例页"更新用例"按钮 | git pull → 读取仓库中 tea-cases.json → 解析导入 | **日常推荐** |

**导入匹配逻辑（以 tea_id 为唯一匹配键）：**

```
按 tea_id 匹配（如 auth_login_redirect_to_dashboard）：
  - 平台没有该 ID → 新增用例，分配 TC-{MODULE}-{seq} 编号
  - 平台已有该 ID → 更新元数据（标题/步骤/优先级/script_ref 等）
  - 平台有但 JSON 中消失 → 标记"脚本已移除"
  - 缺必填字段 → 跳过，记录原因
  - 新 submodule → 自动创建
  - 导入完成 → 返回摘要：新增 N / 更新 M / 移除 K / 跳过 L
```

> **注意：** PRD FR-CASE-002 AC4 原文为"按 script_ref.file 匹配"，需修改为"按 tea_id 匹配"。tea_id 是唯一标识，script_ref.file 可能因脚本重命名/移动而变化。

**项目设置新增字段：**

| 字段 | 说明 | 默认值 |
|------|------|--------|
| JSON 文件路径 | tea-cases.json 在仓库中的相对路径 | `tea-cases.json` |

### 关键架构模式

| 模式 | 说明 |
|------|------|
| 三层架构 | API 路由 → Service 业务逻辑 → Model 数据层 |
| 依赖注入 | FastAPI Depends() 注入 db session、当前用户、权限检查 |
| Pydantic 双模型 | 请求 schema（入参校验）+ 响应 schema（输出格式）分离 |
| 异步优先 | API 路由全部 async，数据库用 asyncpg。API 进程内禁止 subprocess.run |
| Worker 隔离 | subprocess 调用只在 arq Worker 进程中执行，通过 anyio.to_thread.run_sync 包装 |
| 执行超时 | executor 必须有 timeout + process.kill()，防止死循环脚本占用 Worker |

### 测试策略

测试脚本由 TEA 生成在 `tests/` 目录下，分 API 和 E2E 两种类型：

| 类型 | 目录 | 说明 | 占比 |
|------|------|------|------|
| API | `tests/api/{module}/` | 单接口契约测试 + 多接口组合测试 | 70-80% |
| E2E | `tests/e2e/{module}/` | 端到端业务流程测试 | 20-30% |

**每个测试点独立一个 .py 文件，不合并。** 理由：tea-cases.json 1:1 映射、pytest-xdist 文件级并发、故障定位零歧义。

**P0 质量门禁（不可商量）：**

| 模块 | 覆盖率要求 | 原因 |
|------|-----------|------|
| result_parser | 100% 分支 | 解析错误 = 无声数据腐败 |
| 状态机（两套） | 100% 转换路径 | 状态错误 = 数据不一致 |
| 导入匹配逻辑（tea_id） | 100% 分支 | 匹配错误 = 用例数据丢失/覆盖 |

## Core Architectural Decisions

### 术语统一

| 术语 | 含义 | 使用场景 |
|------|------|---------|
| **用例 (case)** | 平台管理的测试项，TC-AUTH-00001 | 用例管理、导入、编辑 |
| **场景 (scenario)** | 用例在一次计划执行中的结果记录 | 报告展示（一个用例执行一次 = 一个场景） |
| **步骤 (step)** | 场景内的单个操作 | 报告详情面板 |

### 角色体系

**两级角色设计：**

| 层级 | 表 | 角色 | 说明 |
|------|---|------|------|
| 系统级 | `users.role` | `admin` / `user` | admin 全局权限，user 需绑定项目 |
| 项目级 | `project_members.role` | `project_admin` / `developer` / `tester` / `guest` | 同一人在不同项目可有不同角色 |

### 数据库 Schema

#### users — 用户

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

#### projects — 项目

```sql
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) UNIQUE NOT NULL,
    description     TEXT,
    git_url         VARCHAR(500) NOT NULL,
    branch          VARCHAR(100) DEFAULT 'main',
    script_path     VARCHAR(500) NOT NULL,
    json_file_path  VARCHAR(200) DEFAULT 'tea-cases.json',
    last_sync_at    TIMESTAMPTZ,
    last_commit_sha VARCHAR(40),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

#### project_members — 项目成员

```sql
CREATE TABLE project_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL,  -- project_admin / developer / tester / guest
    joined_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, user_id)
);
```

#### case_folders — 用例目录（路径模式，最多 4 层）

```sql
CREATE TABLE case_folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES case_folders(id),
    name        VARCHAR(100) NOT NULL,
    path        VARCHAR(500) NOT NULL,  -- "AUTH/LOGIN/正常流程"
    depth       INT NOT NULL,           -- 1-4
    sort_order  INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, path),
    CHECK(depth <= 4)
);
```

> 取代原来的 modules + sub_modules 两表设计。导入时 TEA 的 module + submodule 自动映射为前两层，用户可继续建第 3、4 层。

#### cases — 用例

```sql
CREATE TABLE cases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    case_code         VARCHAR(20) NOT NULL,       -- TC-AUTH-00001
    tea_id            VARCHAR(200),               -- 导入匹配键
    title             VARCHAR(200) NOT NULL,
    type              VARCHAR(10) NOT NULL,       -- api / e2e
    folder_id         UUID REFERENCES case_folders(id),
    priority          VARCHAR(5) NOT NULL DEFAULT 'P2',
    preconditions     TEXT,
    steps             JSONB NOT NULL DEFAULT '[]',
    expected_result   TEXT,
    automation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
                      -- automated / pending / script_removed / archived
    source            VARCHAR(10) NOT NULL,       -- imported / manual
    script_ref_file   VARCHAR(500),
    script_ref_func   VARCHAR(200),
    is_flaky          BOOLEAN DEFAULT false,
    remark            TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, case_code),
    UNIQUE(project_id, tea_id)
);
```

#### environments — 环境配置

```sql
CREATE TABLE environments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    base_url    VARCHAR(500),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE environment_variables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id  UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    key             VARCHAR(100) NOT NULL,
    value           TEXT NOT NULL,
    is_sensitive    BOOLEAN DEFAULT false,
    sort_order      INT DEFAULT 0,
    UNIQUE(environment_id, key)
);
```

#### notification_channels — 通知渠道

```sql
CREATE TABLE notification_channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) UNIQUE NOT NULL,
    webhook_url TEXT NOT NULL,                    -- AES-256 加密存储
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);
```

#### plans — 测试计划

```sql
CREATE TABLE plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    plan_type       VARCHAR(20) NOT NULL,         -- automated / manual
    test_type       VARCHAR(10) NOT NULL,         -- api / e2e（不可混合）
    environment_id  UUID REFERENCES environments(id),
    channel_id      UUID REFERENCES notification_channels(id),  -- 非必填，NULL = 不通知
    retry_count     INT DEFAULT 0,
    circuit_breaker JSONB,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- draft / executing / paused / completed / archived
    created_by      UUID NOT NULL REFERENCES users(id),
    executed_at     TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    commit_sha      VARCHAR(40),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

> **test_type 约束：一个计划只能选 api 或 e2e，不能混合。** 原因：执行环境不同（API 直接跑 pytest，E2E 需要 Playwright 浏览器）。

#### plan_cases — 计划用例关联

```sql
CREATE TABLE plan_cases (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    case_id     UUID NOT NULL REFERENCES cases(id),
    assignee_id UUID REFERENCES users(id),   -- 处理人。自动化=NULL，手动=Lead 分配或 NULL（全员可录）
    sort_order  INT DEFAULT 0,
    UNIQUE(plan_id, case_id)
);
```

#### test_reports — 报告

```sql
CREATE TABLE test_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    environment_id      UUID REFERENCES environments(id),
    executed_by         UUID NOT NULL REFERENCES users(id),
    executed_at         TIMESTAMPTZ NOT NULL,
    completed_at        TIMESTAMPTZ,
    commit_sha          VARCHAR(40),
    -- summary（后端计算，前端直接展示）
    total_scenarios     INT NOT NULL DEFAULT 0,
    passed              INT NOT NULL DEFAULT 0,
    failed              INT NOT NULL DEFAULT 0,
    error               INT NOT NULL DEFAULT 0,
    flaky               INT NOT NULL DEFAULT 0,
    skipped             INT NOT NULL DEFAULT 0,
    xfail               INT NOT NULL DEFAULT 0,
    pass_rate           DECIMAL(5,2),  -- passed/(passed+failed+error+flaky)*100，分母为0时NULL
    total_duration_ms   BIGINT,
    avg_scenario_ms     BIGINT,
    total_requests      INT DEFAULT 0,
    total_assertions    INT DEFAULT 0,
    failed_assertions   INT DEFAULT 0,
    automated_count     INT DEFAULT 0,
    manual_count        INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

#### test_report_scenarios — 场景

```sql
CREATE TABLE test_report_scenarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id       UUID NOT NULL REFERENCES test_reports(id) ON DELETE CASCADE,
    case_id         UUID REFERENCES cases(id),
    case_code       VARCHAR(20),          -- 冗余：用例删除后报告仍能展示编号
    scenario_name   VARCHAR(200) NOT NULL,
    folder_id       UUID REFERENCES case_folders(id),
    folder_path     VARCHAR(500),         -- 冗余：目录路径快照
    status          VARCHAR(20) NOT NULL, -- passed/failed/error/flaky/skipped/xfail
    execution_type  VARCHAR(20) NOT NULL, -- automated / manual
    step_count      INT DEFAULT 0,
    passed_steps    INT DEFAULT 0,
    failed_steps    INT DEFAULT 0,
    duration_ms     BIGINT,
    error_summary   TEXT,
    assignee_id     UUID REFERENCES users(id),
    remark          TEXT,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### test_report_steps — 步骤

```sql
CREATE TABLE test_report_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id     UUID NOT NULL REFERENCES test_report_scenarios(id) ON DELETE CASCADE,
    step_name       VARCHAR(200) NOT NULL,
    http_method     VARCHAR(10),
    url             VARCHAR(1000),        -- 完整 URL 含域名：https://staging.example.com/api/auth/login
    status          VARCHAR(20) NOT NULL,
    status_code     INT,
    duration_ms     BIGINT,
    phase           VARCHAR(20),
    sort_order      INT NOT NULL,
    request_data    JSONB,                -- {headers, params, body}
    response_data   JSONB,                -- {statusCode, headers, body}
    assertions      JSONB,                -- [{id, type, expression, expected, actual, passed}]
    error_summary   TEXT,
    screenshot_url  VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

> **url 字段存完整 URL（含域名）**，由执行引擎拼接 `环境 BASE_URL + 脚本相对路径` 后写入。前端复制 curl 时直接可用。

#### audit_logs — 操作日志

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    project_id      UUID REFERENCES projects(id),
    action          VARCHAR(50) NOT NULL,
    target_type     VARCHAR(50) NOT NULL,
    target_id       UUID,
    target_name     VARCHAR(200),
    changes         JSONB,
    trace_id        VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### API 端点完整列表

#### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户 |

#### 用户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 列表（admin） |
| POST | `/api/users` | 创建 |
| PUT | `/api/users/{id}` | 编辑 |
| DELETE | `/api/users/{id}` | 删除 |

#### 项目

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 列表 |
| POST | `/api/projects` | 创建 |
| PUT | `/api/projects/{id}` | 编辑 |
| DELETE | `/api/projects/{id}` | 删除 |
| POST | `/api/projects/{id}/sync` | Git pull |
| GET | `/api/projects/{id}/members` | 成员列表 |
| POST | `/api/projects/{id}/members` | 添加成员 |
| DELETE | `/api/projects/{id}/members/{userId}` | 移除成员 |

#### 目录管理（导航树）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/{id}/folders` | 目录树 |
| POST | `/api/projects/{id}/folders` | 创建目录 |
| PUT | `/api/folders/{id}` | 重命名 |
| DELETE | `/api/folders/{id}` | 删除（无用例时） |

#### 用例

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/{id}/cases` | 列表 |
| GET | `/api/cases/{id}` | 详情 |
| POST | `/api/projects/{id}/cases` | 新建 |
| PUT | `/api/cases/{id}` | 编辑 |
| DELETE | `/api/cases/{id}` | 删除 |
| POST | `/api/projects/{id}/cases/import` | 上传导入 |
| POST | `/api/projects/{id}/cases/sync` | Git 更新用例 |
| POST | `/api/projects/{id}/cases/batch` | 批量操作 |
| GET | `/api/projects/{id}/cases/export` | 导出 Excel |
| POST | `/api/cases/{id}/execute` | 单用例执行 |

#### 环境

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/environments` | 列表 |
| POST | `/api/environments` | 创建 |
| PUT | `/api/environments/{id}` | 编辑 |
| DELETE | `/api/environments/{id}` | 删除 |
| GET | `/api/environments/{id}/variables` | 变量列表 |
| PUT | `/api/environments/{id}/variables` | 更新变量 |

#### 通知渠道

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/channels` | 列表 |
| POST | `/api/channels` | 创建 |
| PUT | `/api/channels/{id}` | 编辑 |
| DELETE | `/api/channels/{id}` | 删除 |

#### 测试计划

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/{id}/plans` | 列表 |
| GET | `/api/plans/{id}` | 详情 |
| POST | `/api/projects/{id}/plans` | 创建 |
| PUT | `/api/plans/{id}` | 编辑（仅 draft） |
| DELETE | `/api/plans/{id}` | 删除（仅 archived） |
| POST | `/api/plans/{id}/execute` | 执行 |
| POST | `/api/plans/{id}/pause` | 暂停 |
| POST | `/api/plans/{id}/resume` | 恢复 |
| POST | `/api/plans/{id}/abort` | 终止 |
| POST | `/api/plans/{id}/complete` | 确认完成 |
| POST | `/api/plans/{id}/archive` | 归档 |
| PUT | `/api/plans/{id}/assign` | 分配处理人 |
| POST | `/api/plans/{id}/manual-record` | 手动录入 |

#### 报告（三层懒加载）

| 方法 | 路径 | 加载层 |
|------|------|--------|
| GET | `/api/plans/{planId}/report` | L1+L2 |
| GET | `/api/reports/{id}/scenarios/{sid}/steps` | L3 |
| GET | `/api/reports/{id}/steps/{stepId}/detail` | L4 |
| DELETE | `/api/reports/{id}` | — |
| POST | `/api/reports/{id}/export/html` | 异步 |
| POST | `/api/reports/{id}/export/excel` | 异步 |
| GET | `/api/tasks/{taskId}/status` | 任务状态 |

#### 操作日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects/{id}/logs` | 项目日志 |
| GET | `/api/logs` | 全局日志（admin） |

#### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/healthz` | 存活 |
| GET | `/api/readyz` | 就绪 |

### 通过率计算

```
后端计算：pass_rate = passed / (passed + failed + error + flaky) * 100
分母为 0 → pass_rate = NULL → 前端显示 "-"
精度：DECIMAL(5,2)，四舍五入
```

### 需同步给 PM 的新变更

| 变更 | 说明 |
|------|------|
| 角色体系改为两级 | users.role = admin/user，project_members.role = 项目级角色 |
| 模块改为 case_folders | 路径模式，最多 4 层，取代 modules + sub_modules |
| test_type 不可混合 | 一个计划只能选 api 或 e2e |
| 通知渠道非必填 | NULL = 不通知，手动计划前端隐藏 |
| step.url 存完整 URL | 含域名，前端复制 curl 直接可用 |

## Implementation Patterns & Consistency Rules

### 命名规范

#### 数据库

| 维度 | 规则 | 示例 |
|------|------|------|
| 表名 | 小写复数 snake_case | `users`, `test_reports`, `plan_cases` |
| 列名 | 小写 snake_case | `created_at`, `pass_rate` |
| 外键 | `{关联表单数}_id` | `project_id`, `user_id` |
| 索引 | `idx_{表名}_{列名}` | `idx_cases_project_module` |
| JSONB 内部字段 | **snake_case**（和 Python 一致） | `{"status_code": 200, "request_body": {...}}` |

> JSONB 内部用 snake_case，API 序列化层统一转 camelCase 给前端。

#### 后端 Python

| 维度 | 规则 | 示例 |
|------|------|------|
| 文件名 | snake_case | `case_service.py` |
| 类名 | PascalCase | `CaseService`, `TestReport` |
| 函数/方法 | snake_case | `get_cases_by_project()` |
| 变量 | snake_case | `plan_id`, `commit_sha` |
| 常量 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Pydantic schema | PascalCase + 后缀 | `CaseCreateRequest`, `ReportResponse` |
| SQLAlchemy model | PascalCase 单数 | `User`, `TestReport` |

#### 前端 React

| 维度 | 规则 | 示例 |
|------|------|------|
| 文件名 | PascalCase（组件）/ camelCase（工具） | `ReportDetail.jsx`, `formatDuration.js` |
| 组件名 | PascalCase | `ReportDetail` |
| 函数/变量 | camelCase | `handleSave`, `passRate` |
| CSS 变量 | kebab-case | `--color-passed` |

#### API

| 维度 | 规则 | 示例 |
|------|------|------|
| 路径 | `/api/v1/` 前缀，小写复数 kebab-case | `/api/v1/projects/{projectId}/cases` |
| 路径参数 | camelCase | `{projectId}`, `{scenarioId}` |
| 查询参数 | camelCase | `?pageSize=20&sortBy=createdAt` |
| 请求/响应 body | camelCase | `{ "passRate": 87.96 }` |

> API 路径统一加 `/api/v1/` 版本前缀。

### camelCase 转换策略

**全程 snake_case，出口统一转换：**

```python
# 自定义 JSONResponse，统一在序列化出口做 camelCase 转换
class CamelCaseResponse(JSONResponse):
    def render(self, content):
        return super().render(to_camel_case(content))

# 业务代码全程 snake_case，不写 by_alias=True
# Router 级别默认使用 CamelCaseResponse
app = FastAPI(default_response_class=CamelCaseResponse)

# 请求体反序列化：前端发 camelCase → Pydantic 自动转 snake_case
class BaseSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # 允许 snake_case 构造
    )
```

### API 响应格式

#### 成功响应

```json
// 单对象
{ "data": { "id": "xxx", "name": "..." } }

// 列表（分页）
{
  "data": [ ... ],
  "pagination": { "page": 1, "pageSize": 20, "total": 342 }
}

// 无返回值操作
{ "message": "操作成功" }
```

#### 错误响应

```json
{
  "error": {
    "code": "CASE_NOT_FOUND",
    "message": "用例不存在",
    "detail": "case_id=xxx not found"
  }
}
```

> **强制规则：** 禁止直接 `raise HTTPException(400, "xxx")`，全局 exception handler 接管所有异常，统一输出 `{"error": {...}}` 格式。

#### 批量操作响应（部分失败）

```json
{
  "data": {
    "succeeded": 18,
    "failed": 2,
    "errors": [
      { "id": "xxx", "code": "CASE_ARCHIVED", "message": "已归档用例不可操作" }
    ]
  }
}
```

#### HTTP 状态码

| 码 | 场景 |
|----|------|
| 200 | 查询/更新成功 |
| 201 | 创建成功 |
| 202 | 异步任务已接受 |
| 400 | 参数校验失败 |
| 401 | 未登录 / token 过期 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突（重名/状态不允许） |
| 422 | 业务规则校验失败 |
| 500 | 服务端异常 |

### 时间格式

| 场景 | 格式 | 示例 |
|------|------|------|
| API 传输 | ISO 8601 UTC | `"2026-04-14T08:30:00Z"` |
| 数据库存储 | TIMESTAMPTZ | `2026-04-14 08:30:00+00` |
| 前端显示 | `YYYY-MM-DD HH:mm` | `2026-04-14 08:30` |
| 耗时 | 毫秒整数，字段后缀 `Ms` | `durationMs: 2870` |

### 认证模式

```
请求头：Authorization: Bearer {jwt_token}
Token 有效期：8 小时
滑动续期：每次请求时若剩余 < 2h，response header 返回 X-New-Token
前端收到新 token 静默替换，用户无感知
```

### 错误处理

```python
# 统一异常基类
class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

class NotFoundError(AppError): ...
class ForbiddenError(AppError): ...
class ConflictError(AppError): ...

# 全局 handler 接管所有异常（含 FastAPI HTTPException）
@app.exception_handler(AppError)
@app.exception_handler(HTTPException)
async def error_handler(request, exc): ...
```

### 审计日志模式

```python
# 只记操作行为，不记字段级 diff（装饰器拿不到旧值，硬做成本高）
@audit_log(action="update", target_type="case")
async def update_case(...):
    ...

# 审计记录：who + when + what + target
# 不记：具体字段变更前后值
```

### 分页模式

```python
class PageParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str = "created_at"
    sort_order: str = "desc"  # asc / desc
```

### 软删除约定

```sql
-- 需要软删除的表：cases, plans
-- 字段：deleted_at TIMESTAMPTZ，NULL = 未删除
-- 查询默认过滤：WHERE deleted_at IS NULL
-- 唯一索引加条件：CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL
```

### Alembic 迁移规范

```
- 一人一分支一 migration
- 禁止修改已合并的 migration 文件
- merge 后执行 alembic merge heads 合并分支
- 每个 migration 必须有 downgrade（可回滚）
```

### 文件上传策略

| 类型 | 存储 | 限制 | 路径命名 |
|------|------|------|---------|
| tea-cases.json | 临时解析，不持久化 | ≤ 50MB | — |
| 截图 | 本地磁盘（一期），后续迁移对象存储 | ≤ 10MB/张 | `uploads/{project_id}/screenshots/{execution_id}/{step_id}.png` |
| Excel/HTML 导出 | 本地磁盘 | — | `exports/{report_id}/{timestamp}.{ext}` |

### 幂等性

```
POST 创建资源：请求头 X-Idempotency-Key
后端用 Redis SET NX 去重，TTL 24h
重复请求直接返回首次创建的结果
```

### JSONB Schema 校验

```python
# 写入前校验，防止脏数据进库
from jsonschema import validate

STEPS_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["seq", "action"],
        "properties": {
            "seq": {"type": "integer"},
            "action": {"type": "string"},
        }
    }
}

def validate_steps(steps: list):
    validate(instance=steps, schema=STEPS_SCHEMA)
```

### 前端状态色统一引用

```javascript
// src/constants/status.js — 所有页面统一导入，禁止组件内硬编码色值
export const STATUS_CONFIG = {
  passed:  { label: '通过',   color: '#6ecf96', bg: '#eefbf3' },
  failed:  { label: '失败',   color: '#f08a8e', bg: '#fef0f1' },
  error:   { label: '错误',   color: '#f5b87a', bg: '#fef5eb' },
  flaky:   { label: 'Flaky',  color: '#f0d86e', bg: '#fefce8' },
  skipped: { label: '跳过',   color: '#bfc4cd', bg: '#f5f5f7' },
  xfail:   { label: '预期失败', color: '#b89aed', bg: '#f5f0fe' },
}
```

> **ESLint 规则：禁止 style 属性中出现 `#` 开头的颜色字面量。** E2E 测试断言 `data-testid` 语义，不断言样式值。

### TEA 生成脚本约束

TEA 的 prompt 模板必须注入以下规范：

| 约束 | 说明 |
|------|------|
| 响应格式 | 断言 `resp["data"]` 或 `resp["error"]["code"]`，不写 `resp["status"]` |
| 分页起始值 | `page=1` 开始，不写 `page=0` |
| 时间比较 | 用 `datetime.fromisoformat()` 解析，不做字符串比较 |
| JSONB 字段 | snake_case 访问（和 Python 一致） |
| API 路径 | 带 `/api/v1/` 前缀 |

## 功能补充决策

### 模块管理 — 导入自动生成 + 导航树增删改

**取消独立模块管理页面。** 模块通过两种方式管理：

**1）导入自动生成：**

```
导入 tea-cases.json 时：
  module="AUTH" 不存在 → 自动创建模块 AUTH
  submodule="LOGIN" 不存在 → 自动创建子模块 LOGIN
  整个树结构由导入数据驱动生成，无需提前手动建模块
```

**2）用例导航树上直接操作：**

| 操作 | 触发方式 | 约束 |
|------|---------|------|
| 新建模块 | 导航树底部 + 按钮 | 缩写码全大写，项目内唯一 |
| 新建子模块 | 右键模块 → 新建 | 名称模块内唯一 |
| 重命名 | 右键 → 重命名 | 模块缩写码有用例后不可改 |
| 删除 | 右键 → 删除 | 仅允许删除无用例的模块/子模块 |
| 移动用例 | 拖拽用例到其他模块/子模块 | — |

### 测试计划和报告 — 支持删除

| 对象 | 删除条件 | 行为 |
|------|---------|------|
| 测试计划 | 已归档状态 | 彻底删除计划 + 关联执行记录，二次确认弹窗 |
| 测试报告 | 任何已完成报告 | 彻底删除报告数据（scenarios + steps），二次确认弹窗 |

> 删除不可逆。弹窗提示："此操作不可撤销，将永久删除 [计划名/报告名] 及其所有执行数据。确认删除？"

### 自动化部署 Skill

**交付物新增：** 一个 Claude Code Skill，用于自动化部署测试管理平台。

**用户输入：**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| 服务器地址 | IP 或域名 | — |
| SSH 账号 | 登录用户名 | — |
| SSH 密码/密钥 | 认证方式 | — |
| 安装路径 | 平台安装目录 | `/opt/test-platform` |
| 操作系统 | Linux / Windows | 自动检测 |

**Skill 执行流程：**

```
1. SSH 连接服务器
2. 环境检查：Python 3.10+ / PostgreSQL 13+ / Node.js / Git / Redis
3. 缺少的自动安装（apt/yum/winget）
4. 拉取代码到安装路径
5. 后端：pip install → alembic upgrade → 创建管理员账号
6. 前端：npm install → npm run build → 配置 nginx
7. 启动服务：FastAPI + arq Worker + Redis
8. 自检：访问登录页 → API 健康检查 → 输出部署报告
```

支持 Linux（Ubuntu/CentOS）和 Windows Server 两套部署逻辑。
