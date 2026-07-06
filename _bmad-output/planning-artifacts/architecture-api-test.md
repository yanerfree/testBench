---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd-api-test.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "project-context.md"
workflowType: 'architecture'
project_name: 'testBench 接口测试模块'
user_name: 'Dreamer'
date: '2026-07-03'
---

# Architecture Decision Document — testBench 接口测试模块

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 37 条 FR，7 个能力域

| 能力域 | FR 数 | 架构含义 |
|--------|-------|---------|
| AI 生成 | 7 | 双通道（MCP + 平台内）、LLM 调用、JSON 解析、智能拆分逻辑 |
| 场景管理 | 8 | CRUD + 状态机(草稿→已发布→已废弃) + 批量操作 + 独立文件夹树 |
| 步骤编辑 | 4 | JSONB 字段更新、复制/拆分操作 |
| AI 优化 | 3 | LLM 调用 + 方案展示 + 确认执行流程 |
| 测试执行 | 6 | HTTP 客户端、token 缓存、多角色、变量传递、自动清理 |
| 测试报告 | 4 | 集成已有报告系统、类型扩展、命名规则 |
| Claude Code | 5 | MCP Server 真实化、API Key 认证、Mock 解耦、Skill 分发 |

**Non-Functional Requirements（架构驱动力）：**

| NFR | 目标值 | 架构影响 |
|-----|--------|---------|
| 单步执行延迟 | < 500ms | httpx AsyncClient + 连接池 |
| AI 生成速度 | < 30s/接口 | SSE 流式返回、超时处理 |
| 数据清理成功率 | 100% | 执行引擎记录所有创建的资源 ID |
| MCP Mock 解耦 | 互不影响 | 独立路由或请求来源隔离 |

### Technical Constraints & Dependencies

- **已有平台约束**：React SPA + FastAPI + PostgreSQL + SQLAlchemy（不可改变）
- **MCP 协议**：StreamableHTTP，兼容 MCP 2025-03-26 规范
- **AI 调用**：通过已有的 AI 配置体系（系统级→项目级），不直接调 LLM API
- **复用组件**：环境管理、用户认证、API 接口管理、测试报告、AI 配置

### Cross-Cutting Concerns

- **MCP 路由冲突**：Mock 和真实 Server 共用 `/mcp/`，需要解耦
- **Token 管理**：环境级缓存 + 多角色切换 + 过期刷新，跨所有执行步骤
- **测试数据生命周期**：创建→记录ID→使用→自动清理，贯穿整个执行流程
- **变量传递**：步骤间 `${VAR}` 解析，环境变量 + 运行时提取变量合并

## Technology Stack

**Brownfield 项目 — 全部继承已有平台技术栈，无新增选择。**

| 层级 | 技术 |
|------|------|
| 前端 | React + Ant Design |
| 后端 | FastAPI + SQLAlchemy (async) |
| 数据库 | PostgreSQL |
| MCP | FastMCP (StreamableHTTP) |
| HTTP 客户端 | httpx (AsyncClient，用于测试执行) |
| AI 调用 | 已有 AI 配置体系（系统级→项目级→LLM Client） |

## Core Architectural Decisions

### ADR-1: MCP Mock 与 MCP Server 解耦

**决策**：分路由隔离。真实 MCP Server 保持 `/mcp/`，Mock Server 迁移到 `/mcp-mock-server/`。

**理由**：彻底隔离，互不影响。Mock 页面只需改一个地址引用。Claude Code 连接 `/mcp/` 永远拿到真实数据，不受 Mock 开关影响。

**影响范围**：
- `backend/app/main.py`：Mock app 挂载路径改为 `/mcp-mock-server/`
- `frontend/src/pages/mcp-mock/McpMock.jsx`：地址引用更新
- `backend/app/mcp/__init__.py`：去掉 `mock_enabled()` 判断，真实工具直接走 DB

### ADR-2: 测试执行引擎 — 同步串行

**决策**：MVP 使用同步串行执行。

**理由**：20-30 步骤串行可在 3 分钟内完成（NFR4），满足当前需求。异步队列（arq/Redis）增加复杂度，留给后续大规模批量运行时再引入。

**执行流程**：
```
run_scenario(scenario_id, env_id):
  1. 环境级 token 获取（缓存复用）
  2. for step in scenario.steps:
       if not step.enabled: skip
       resolve_variables(step, env + runtime_vars)
       response = httpx.request(method, url, headers, body)
       check_assertions(response, step.assertions)
       extract_variables(response, step.variables_extract)
       record_created_resources(response)  # 记录 201 响应的资源 ID
  3. cleanup_created_resources()  # 场景级清理
  4. generate_report()
```

### ADR-3: Token 缓存 — 会话级内存

**决策**：会话级内存缓存。批量运行多个场景时，同一角色的 token 只登录一次，整个运行结束释放。

**实现**：
```python
class TokenCache:
    tokens: dict[str, str]  # {role: token}
    
    def get_token(self, role, env_vars) -> str:
        if role in self.tokens:
            return self.tokens[role]
        token = login(env_vars[f"{role}_USER"], env_vars[f"{role}_PASS"])
        self.tokens[role] = token
        return token
```

**生命周期**：运行开始创建 → 运行结束销毁。不存 DB，不跨运行复用。

### ADR-4: 测试数据清理 — 场景级

**决策**：场景级清理。场景执行过程中记录所有 POST 201 响应的资源 ID，场景结束后倒序 DELETE 清理。

**实现**：
```python
created_resources: list[dict]  # [{method: "DELETE", url: "/api/users/123"}]

# 步骤执行时
if response.status_code == 201 and "id" in response.json().get("data", {}):
    resource_id = response.json()["data"]["id"]
    created_resources.append({
        "method": "DELETE",
        "url": f"{base_url}/{resource_path}/{resource_id}"
    })

# 场景结束时
for resource in reversed(created_resources):
    try: httpx.delete(resource["url"], headers=auth_headers)
    except: log.warning(f"cleanup failed: {resource}")
```

**失败处理**：清理失败记录日志并告警，不影响测试结果判定。

## Implementation Patterns & Consistency Rules

### 继承已有平台约定

| 类别 | 约定 |
|------|------|
| 数据库表名 | 蛇形复数：`api_test_scenarios`, `api_test_steps` |
| 列名 | 蛇形：`folder_id`, `sort_order`, `created_at` |
| API 路由 | 蛇形：`/api/projects/{id}/branches/{id}/api-tests` |
| API 响应 | `{"data": {...}}` 包装 |
| 前端文件 | PascalCase 组件：`ApiTest.jsx` |
| 前端 JSON 字段 | camelCase：`folderId`, `sortOrder`, `createdAt` |
| 后端→前端转换 | model snake_case → API 返回 camelCase（`_to_dict` 手动转换） |

### 接口测试模块新增约定

| 类别 | 约定 |
|------|------|
| 场景编号 | `AT-{四位序号}`：AT-0001, AT-0002 |
| MCP 工具命名 | `tb_{动作}_{资源}`：`tb_generate_api_test` |
| 断言 JSON | `{"type": "status", "operator": "==", "value": 200}` |
| 场景状态 | `draft` → `published` → `deprecated`（只能前进不能回退） |
| 报告命名 | 单场景=场景名，同文件夹=文件夹名+时间，跨文件夹=接口测试回归+时间 |
| SSE 事件 | `step_start`, `step_done`, `scenario_created`, `error`, `done` |

### 变量体系（三层）

| 变量类型 | 来源 | 格式 | 示例 | 定义者 |
|---------|------|------|------|--------|
| 环境变量 | 环境配置页面 | `${VAR}` | `${BASE_URL}`, `${LANG}`, `${ADMIN_USER}` | 用户预先配好 |
| 运行时变量 | 执行时自动生成 | `${RANDOM_8}`, `${TIMESTAMP}` | 随机后缀、时间戳 | 系统自动 |
| 步骤提取变量 | 上一步响应 | `${token}`, `${userId}` | 从 response body 提取 | AI 生成时定义 |

**解析优先级**：步骤提取变量 > 运行时变量 > 环境变量 > 全局变量

**AI 生成行为**：
- 生成前读取当前环境的变量列表
- 步骤中自动用 `${VAR}` 引用，不写死环境相关的值
- 对于环境里缺少的常用变量，AI 提示用户补充

**角色变量命名约定**：`{ROLE}_USER` / `{ROLE}_PASS`（如 `ADMIN_USER`, `USER_PASS`）

### 执行引擎模式

```
请求执行流程：
  resolve_variables(${VAR}) → build_request → send_request → 
  check_assertions → extract_variables → record_created_resources

清理顺序：
  倒序清理（后创建的先删除，避免外键约束）
```
