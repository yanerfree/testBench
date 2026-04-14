---
stepsCompleted: [1, 2, 3]
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
├── tests/                         # 后端测试
│   ├── conftest.py                # 全局 fixtures
│   ├── factories/                 # 测试数据工厂
│   ├── fixtures/                  # 共享 fixture（db/redis/git/auth）
│   ├── data/                      # 固定测试数据
│   │   ├── junit_samples/         # JUnit XML 样本
│   │   ├── step_json_samples/     # 步骤级 JSON 样本
│   │   └── tea_import_samples/    # tea-cases.json 导入样本
│   ├── unit/                      # 单元测试（80%，< 30s）
│   │   ├── test_models/
│   │   ├── test_services/
│   │   ├── test_engine/
│   │   ├── test_schemas/
│   │   └── test_core/
│   ├── integration/               # 集成测试（15%，< 3min）
│   │   ├── test_db/               # ORM 查询、分页性能
│   │   ├── test_api/              # 单个 API 接口完整链路（真实 DB + TestClient）
│   │   ├── test_engine/           # 真实 subprocess + git worktree
│   │   ├── test_import/           # tea-cases.json 导入全链路
│   │   └── test_arq/             # 任务入队→消费→回写
│   └── e2e/                       # 端到端测试（5%，< 10min）
│
├── pyproject.toml
├── alembic.ini
└── .env.example
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

### tea-cases.json 管理

**文件位置：** 项目 Git 仓库根目录（可在项目设置中自定义路径）

```
项目 Git 仓库/
├── tests/
│   ├── api/...
│   ├── e2e/...
│   └── conftest.py
├── tea-cases.json              ← TEA 生成，和脚本同一 commit
├── pytest.ini
└── requirements.txt
```

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

| 层级 | 比例 | 时间预算 | 触发时机 |
|------|------|---------|---------|
| Unit | 80% | < 30s | 每次 commit |
| Integration | 15% | < 3min | 每次 PR |
| E2E | 5% | < 10min | merge 到 main |

**P0 质量门禁（不可商量）：**

| 模块 | 覆盖率要求 | 原因 |
|------|-----------|------|
| result_parser | 100% 分支 | 解析错误 = 无声数据腐败 |
| 状态机（两套） | 100% 转换路径 | 状态错误 = 数据不一致 |
| 导入匹配逻辑 | 100% 分支 | 匹配错误 = 用例数据丢失/覆盖 |

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
