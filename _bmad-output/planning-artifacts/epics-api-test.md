---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd-api-test.md"
  - "_bmad-output/planning-artifacts/architecture-api-test.md"
  - "_bmad-output/planning-artifacts/ux-design-api-test.md"
status: complete
---

# Epics & Stories — testBench 接口测试模块 MVP

## Epic 概览

| # | Epic | Stories | FR 覆盖 | 依赖 |
|---|------|---------|---------|------|
| E1 | 基础设施 | 4 | FR37, ADR-1 | 无 |
| E2 | 场景管理 | 6 | FR8-FR15 | E1 |
| E3 | 步骤编辑 | 4 | FR16-FR19 | E2 |
| E4 | AI 测试生成（平台通道） | 4 | FR2-FR7 | E2, E3 |
| E5 | 测试执行引擎 | 5 | FR23-FR28 | E2, E3 |
| E6 | 测试报告集成 | 3 | FR29-FR32 | E5 |
| E7 | AI 优化 | 2 | FR20-FR22 | E3, E4 |
| E8 | Claude Code 集成 | 4 | FR1, FR33-FR36 | E4 |
| E9 | 分支管理 | 3 | FR38-FR42 | E2 |
| E10 | 状态审计与度量 | 2 | FR43-FR46 | E2, E6 |

**总计：37 个 Stories**

---

## E1: 基础设施

> MCP 解耦 + 数据模型完善，为后续所有功能打基础

### S1.1: MCP Mock 与 MCP Server 路由解耦

**FR**: FR37
**ADR**: ADR-1

**描述**: 将 MCP Mock Server 从 `/mcp/` 迁移到 `/mcp-mock-server/`，去掉 `mock_enabled()` 开关，真实 MCP Server 始终走 `/mcp/`。

**验收标准**:
- [ ] `backend/app/main.py` 中 Mock app 挂载路径为 `/mcp-mock-server/`
- [ ] `backend/app/mcp/__init__.py` 中去掉 `mock_enabled()` 判断
- [ ] MCP Mock 前端页面地址引用更新为新路径
- [ ] `/mcp/` 路由只响应真实 MCP 工具调用
- [ ] Mock 页面功能不受影响（可正常创建/编辑 Mock）

### S1.2: 完善 ApiTestScenario 数据模型

**FR**: FR11, FR14

**描述**: 在已有模型基础上，确保 `status`、`source`、`priority`、`env_variables`、`source_api_ids` 字段完整且有默认值。

**验收标准**:
- [ ] `status` 字段默认 `draft`，枚举 `draft/published/deprecated`
- [ ] `source` 字段默认 `manual`，枚举 `ai/manual`
- [ ] `priority` 字段默认 `P1`，枚举 `P0/P1/P2/P3`
- [ ] `source_api_ids` JSONB 默认 `[]`
- [ ] 数据库 migration 成功执行

### S1.3: 完善 ApiTestStep 数据模型

**FR**: FR16, FR17

**描述**: 确保步骤模型包含 `enabled`、`assertions`、`variables_extract`、`pre_script`、`post_script`、`last_status`、`last_response` 字段。

**验收标准**:
- [ ] `enabled` 布尔字段默认 `True`
- [ ] `assertions` JSONB 默认 `[]`
- [ ] `variables_extract` JSONB 默认 `{}`
- [ ] `last_status` 可空字符串（`pass/fail/skip/null`）
- [ ] `last_response` JSONB 可空（存最近一次执行的响应）
- [ ] `sort_order` 整数字段用于排序

### S1.4: 前端页面三栏布局骨架

**描述**: 重构 `ApiTest.jsx` 为三栏布局容器，拆分出 FolderTree、ScenarioList、StepList、StepEditor 组件文件（空壳），实现视图切换逻辑。

**验收标准**:
- [ ] 创建 `pages/api-test/components/` 目录及组件文件
- [ ] 主页面实现两种视图切换：列表视图（目录树+表格）和详情视图（目录树+步骤列表+编辑器）
- [ ] 目录树宽度 220px，步骤列表 300px，编辑器占剩余
- [ ] 选中场景 → 详情视图，点 ✕ → 返回列表视图
- [ ] 页面与侧边栏路由正常工作

---

## E2: 场景管理

> 目录树 CRUD + 场景 CRUD + 状态流转 + 批量操作

### S2.1: 文件夹目录树 CRUD

**FR**: FR9

**描述**: 实现 FolderTree 组件，支持多级嵌套文件夹的创建、重命名、删除、展开/折叠。

**后端**:
- `POST /api-tests/folders` — 创建文件夹
- `PUT /api-tests/folders/{id}` — 重命名
- `DELETE /api-tests/folders/{id}` — 删除（仅空文件夹）
- `GET /api-tests/folders` — 获取文件夹树

**验收标准**:
- [ ] 可创建多级嵌套文件夹（弹窗输入名称+选父级）
- [ ] 文件夹名可内联编辑（双击重命名）
- [ ] 空文件夹可删除，非空文件夹删除按钮禁用并提示
- [ ] 每个节点显示场景计数
- [ ] 点击文件夹 → 右侧表格筛选该文件夹下的场景

### S2.2: 场景 CRUD + 列表页

**FR**: FR8, FR14, FR15

**描述**: 实现 ScenarioList 组件，表格展示场景列表，支持创建、删除、搜索、筛选。

**后端**:
- `GET /api-tests/scenarios?folder_id=&status=&search=&page=&size=` — 列表
- `POST /api-tests/scenarios` — 创建空场景（source=manual）
- `DELETE /api-tests/scenarios/{id}` — 删除

**验收标准**:
- [ ] 表格列：场景 ID(AT-xxxx)、标题、来源 Tag(AI/手动)、优先级 Tag(P0-P3)、状态 Tag、操作
- [ ] 支持搜索（ID 或标题）
- [ ] 支持按状态筛选（全部/草稿/已发布/已废弃）
- [ ] 点击行 → 进入场景详情视图
- [ ] 新建场景弹窗（标题+目标文件夹+优先级）
- [ ] 删除需确认

### S2.3: 场景状态流转

**FR**: FR11, FR12

**描述**: 实现场景状态机：draft → published → deprecated，以及对应的编辑/执行权限控制。

**后端**:
- `PUT /api-tests/scenarios/{id}/status` — `{status: "published"}` 改状态

**验收标准**:
- [ ] 草稿：可编辑、可调试执行（结果不进报告）
- [ ] 已发布：不可编辑（字段只读），正式执行进报告
- [ ] 已废弃：不可编辑、不可执行
- [ ] 状态只能前进：draft→published, published→deprecated
- [ ] 步骤列表顶部的状态下拉显示当前状态并限制可选项

### S2.4: 批量操作

**FR**: FR13

**描述**: 表格支持 checkbox 多选，选中后工具栏出现批量操作按钮。

**后端**:
- `PUT /api-tests/scenarios/batch` — `{ids: [], action: "publish|deprecate|delete|move", folder_id?}`

**验收标准**:
- [ ] 表格行有 checkbox，表头有全选
- [ ] 选中后工具栏显示：批量改状态、批量删除、批量移动
- [ ] 批量改状态支持：草稿→已发布、已发布→已废弃
- [ ] 批量移动弹窗选择目标文件夹
- [ ] 操作后刷新列表

### S2.5: 场景移动到文件夹

**FR**: FR10

**描述**: 支持将场景从一个文件夹移到另一个文件夹（单个或批量）。

**后端**:
- `PUT /api-tests/scenarios/{id}` — `{folder_id: xxx}` 更新所属文件夹

**验收标准**:
- [ ] 单个场景可通过编辑或拖拽移动
- [ ] 批量移动通过批量操作按钮 → 选择目标文件夹弹窗
- [ ] 移动后源文件夹和目标文件夹计数更新

### S2.6: 场景详情 — 步骤列表

**FR**: FR16（部分）

**描述**: 实现 StepList 组件，展示场景下的步骤列表，包含状态指示、方法标签、步骤名。

**验收标准**:
- [ ] 顶部显示场景编号 + 来源 Tag + 状态下拉 + ✕返回按钮
- [ ] 步骤显示：状态图标(○/✓/✕) + 方法标签(POST绿/DELETE红等) + 名称
- [ ] 点击步骤 → 右栏编辑器显示该步骤详情
- [ ] 进入场景自动选中第一个步骤
- [ ] 底部"+ 添加步骤"按钮

---

## E3: 步骤编辑

> 请求编辑器所有字段可编辑

### S3.1: StepEditor — 请求基本信息编辑

**FR**: FR17

**描述**: 实现 StepEditor 组件的基本编辑功能：步骤名、HTTP 方法、URL、Body。

**后端**:
- `PUT /api-tests/scenarios/{id}/steps/{step_id}` — 更新步骤字段

**验收标准**:
- [ ] 步骤名：点击变 Input，blur 自动保存
- [ ] Method：下拉选择（GET/POST/PUT/DELETE/PATCH），选择即保存
- [ ] URL：可编辑 Input，blur 自动保存
- [ ] Body：textarea 编辑器，点"保存"按钮保存
- [ ] 所有编辑操作调后端 PUT 持久化

### S3.2: StepEditor — Headers 和断言编辑

**FR**: FR17

**描述**: Headers 和断言的表格式编辑。

**验收标准**:
- [ ] Headers Tab：Key/Value 表格，可增行、删行、编辑值，blur 自动保存
- [ ] 断言 Tab：类型(status/jsonpath/contains)/字段/操作符/期望值 表格，可增删改
- [ ] 断言类型下拉：`status`(状态码) / `jsonpath`(JSON 路径) / `contains`(包含文本)
- [ ] 操作符下拉：`==` / `!=` / `>` / `<` / `contains` / `not_contains`

### S3.3: StepEditor — 变量提取编辑

**FR**: FR17, FR28

**描述**: 变量提取的 Key-Value 编辑界面。

**验收标准**:
- [ ] 变量提取 Tab：变量名(key) + JSONPath 表达式(value) 表格
- [ ] 可增加/删除/编辑变量提取规则
- [ ] blur 自动保存
- [ ] 显示说明文字："从响应中提取变量，后续步骤可用 ${变量名} 引用"

### S3.4: 步骤增删排序 + 场景复制/拆分

**FR**: FR16, FR18, FR19

**描述**: 步骤的增加、删除、排序操作，以及场景级的复制和拆分。

**后端**:
- `POST /api-tests/scenarios/{id}/steps` — 新增步骤
- `DELETE /api-tests/scenarios/{id}/steps/{step_id}` — 删除步骤
- `PUT /api-tests/scenarios/{id}/steps/reorder` — `{step_ids: [排序后的ID列表]}`
- `POST /api-tests/scenarios/{id}/copy` — 复制场景
- `POST /api-tests/scenarios/{id}/split` — `{step_ids: [要拆分的步骤]}` 拆分为新场景

**验收标准**:
- [ ] 底部"+ 添加步骤"按钮 → 新增空步骤到末尾
- [ ] 步骤旁有删除按钮（hover 显示），确认后删除
- [ ] 步骤可拖拽排序（更新 sort_order）
- [ ] 场景头部"更多"菜单：复制场景、拆分步骤
- [ ] 复制场景 → 创建新场景（标题加"(副本)"后缀，status=draft）
- [ ] 拆分 → 选中步骤创建为新场景，原场景保留未选步骤

---

## E4: AI 测试生成（平台通道）

> 平台内选择接口或手动输入 → AI 生成测试场景

### S4.1: 生成弹窗 UI

**FR**: FR2, FR3

**描述**: 实现 GenerateModal 组件，支持从 API 列表选择或手动输入接口定义。

**验收标准**:
- [ ] 弹窗标题"生成接口测试"
- [ ] 接口来源切换：从项目 API 列表选择 / 手动输入
- [ ] API 列表选择：多选列表，显示已选数量
- [ ] 手动输入：textarea，支持 OpenAPI JSON 或文本描述
- [ ] 目标文件夹：下拉选择（可选，不选则 AI 自动创建）
- [ ] 环境变量：下拉选择环境
- [ ] "开始生成"按钮

### S4.2: AI 生成后端 — 智能场景拆分

**FR**: FR4, FR5, FR7

**描述**: AI 生成服务按测试维度拆分场景，正反分离，生成具体参数值和断言。

**后端**:
- `POST /api-tests/generate` — `{api_ids?: [], definition?: string, folder_id?, env_id}`
- SSE 流式返回生成进度

**验收标准**:
- [ ] 每个接口生成多个场景，按维度拆分：正向测试、参数校验、安全测试、权限测试
- [ ] 边界合法值归入正向场景，非法值归入反向场景
- [ ] 每个步骤包含具体的请求参数值（不是占位描述）
- [ ] 每个步骤包含具体的断言（状态码 + 响应字段校验）
- [ ] SSE 事件：`scenario_created`(场景名) → `step_created` → `done`/`error`
- [ ] 生成的场景 source=ai, status=draft

### S4.3: 智能目录归类

**FR**: FR6

**描述**: 批量生成时，AI 根据接口 URL 路径自动识别模块并创建文件夹归类。

**验收标准**:
- [ ] `/api/users/*` → 自动创建"用户管理"文件夹
- [ ] `/api/auth/*` → 自动创建"认证"文件夹
- [ ] 已存在同名文件夹时直接归入，不重复创建
- [ ] 单接口生成且指定了目标文件夹时，不创建新文件夹

### S4.4: AI 生成 Prompt 优化

**FR**: FR7

**描述**: 完善 AI 生成的 prompt 模板，确保生成质量（维度完整、参数具体、清理步骤）。

**验收标准**:
- [ ] Prompt 包含：接口 schema、环境变量列表、维度拆分规则、输出 JSON 格式
- [ ] 生成结果引用环境变量 `${BASE_URL}`、`${ADMIN_USER}` 等，不写死
- [ ] 正向场景末尾自动生成 DELETE 清理步骤
- [ ] 参数校验场景覆盖：必填缺失、类型错误、长度超限、格式非法
- [ ] 安全场景覆盖：XSS 注入、SQL 注入（如适用）
- [ ] 生成失败时已完成的场景保留（FR45）

---

## E5: 测试执行引擎

> 单步执行 + 批量执行 + Token 管理 + 变量传递

### S5.1: 单步执行

**FR**: FR23

**描述**: 点击步骤的"运行"按钮，发送请求并显示响应结果。

**后端**:
- `POST /api-tests/scenarios/{id}/steps/{step_id}/run` — `{env_id}`

**验收标准**:
- [ ] 点运行 → 按钮变 loading → 发送 HTTP 请求
- [ ] 变量解析：`${VAR}` 替换为环境变量值
- [ ] 响应 Tab 显示：状态码 Tag + 耗时 + JSON 响应体
- [ ] 断言结果：每条断言显示通过/失败
- [ ] 步骤状态图标更新（✓绿/✕红）
- [ ] `last_status` 和 `last_response` 持久化

### S5.2: 变量传递机制

**FR**: FR28

**描述**: 实现三层变量体系：步骤提取 > 运行时 > 环境变量。

**验收标准**:
- [ ] 环境变量 `${BASE_URL}` 从环境配置读取
- [ ] 运行时变量 `${RANDOM_8}` 自动生成 8 位随机字符串
- [ ] 运行时变量 `${TIMESTAMP}` 自动生成当前时间戳
- [ ] 步骤提取变量：根据 `variables_extract` 的 JSONPath 从响应中提取
- [ ] 提取的变量在后续步骤中可用 `${变量名}` 引用
- [ ] 优先级：步骤提取 > 运行时 > 环境 > 全局

### S5.3: Token 自动管理

**FR**: FR25, FR26

**描述**: 实现 TokenCache，环境级 token 缓存 + 多角色支持 + 401 被动重试。

**后端**:
- `TokenCache` 类实现（ADR-3）

**验收标准**:
- [ ] 批量运行多场景时，同一角色 token 只登录一次
- [ ] 通过 `{ROLE}_USER`/`{ROLE}_PASS` 环境变量获取角色凭据
- [ ] 默认角色为 `ADMIN`（使用 `ADMIN_USER`/`ADMIN_PASS`）
- [ ] 步骤 headers 含 `Authorization` 时自动注入 token
- [ ] 遇到 401 时：检查断言是否预期 401 → 非预期则刷新 token 重试一次
- [ ] 运行结束后 TokenCache 销毁

### S5.4: 场景批量执行

**FR**: FR24

**描述**: 选中场景或文件夹 → 选环境 → 批量执行所有步骤。

**后端**:
- `POST /api-tests/run` — `{scenario_ids: [], env_id}` SSE 流式返回进度

**验收标准**:
- [ ] 选择环境下拉 → 点运行按钮
- [ ] SSE 流式显示：步骤名 + 通过/失败
- [ ] 场景串行执行，步骤串行执行（ADR-2）
- [ ] 全局信号量限制并发（ADR-7，默认 5）
- [ ] 单步失败不影响后续步骤（NFR10），标记失败继续
- [ ] 场景级 AsyncClient 复用（ADR-6）

### S5.5: 测试数据清理

**FR**: FR27

**描述**: AI 生成的清理步骤正常执行，清理失败分级处理。

**验收标准**:
- [ ] AI 生成的 DELETE 清理步骤作为普通步骤执行
- [ ] 清理步骤失败：404 → info, 409 → warning, 500 → error
- [ ] 清理结果透出到测试报告（不仅是后端日志）
- [ ] 清理步骤在报告中标记为"清理"类型

---

## E6: 测试报告集成

> 执行结果写入报告系统，支持类型筛选和步骤下钻

### S6.1: 报告模型扩展

**FR**: FR30

**描述**: TestReport 模型新增 `report_type` 字段，`plan_id` 改为可空。

**后端**:
- `report.py` 模型修改

**验收标准**:
- [ ] `report_type` 字段：`api_test` / `scenario_test`（预留）/ `plan`（已有）
- [ ] `plan_id` 改为可空（接口测试报告不挂测试计划）
- [ ] 已有报告功能不受影响
- [ ] migration 成功，已有数据 report_type 默认 `plan`

### S6.2: 报告自动生成

**FR**: FR29, FR31

**描述**: 每次执行自动创建报告，命名规则自动生成。

**后端**:
- `api_test_report.py` 报告生成服务

**验收标准**:
- [ ] 单场景执行 → 报告名 = 场景名称
- [ ] 同文件夹批量 → 报告名 = 文件夹名 + 时间（如"用户管理 2026-07-03 14:30"）
- [ ] 跨文件夹批量 → 报告名 = "接口测试回归 2026-07-03 14:30"
- [ ] 报告 report_type = `api_test`
- [ ] 草稿场景调试执行不生成报告，已发布场景执行才生成

### S6.3: 报告详情 — 步骤级下钻

**FR**: FR32

**描述**: 报告详情页可下钻到每个步骤的请求/响应/断言结果。

**前端**:
- ReportDetail 页面扩展

**验收标准**:
- [ ] 报告列表支持按 report_type 筛选（接口测试/功能测试/计划）
- [ ] 接口测试报告详情：场景列表 → 点开 → 步骤列表
- [ ] 每个步骤显示：请求(method+URL+headers+body) + 响应(status+body) + 断言结果(✓/✕)
- [ ] 失败步骤红色高亮
- [ ] 通过率统计：通过步骤数 / 总步骤数

---

## E7: AI 优化

> 用户提建议 → AI 给方案 → 确认后执行

### S7.1: AI 优化对话界面

**FR**: FR20, FR21

**描述**: 场景详情页增加 AI 优化入口，用户输入修改建议，AI 返回方案，确认后执行。

**后端**:
- `POST /api-tests/scenarios/{id}/ai-optimize` — `{suggestion: string}` → 返回方案
- `POST /api-tests/scenarios/{id}/ai-optimize/apply` — `{plan_id}` → 执行方案

**验收标准**:
- [ ] 步骤列表顶部"AI 优化"按钮 → 打开侧边抽屉
- [ ] 用户输入修改建议（如"增加中文用户名测试"）
- [ ] AI 返回方案：具体要新增/修改/删除的步骤，展示对比
- [ ] 用户点"确认执行"→ 方案应用到场景
- [ ] 用户可修改建议重新生成方案

### S7.2: AI 优化能力

**FR**: FR22

**描述**: AI 优化可以增加步骤、减少步骤、修改断言、调整变量。

**验收标准**:
- [ ] 增加步骤：AI 生成新步骤插入指定位置
- [ ] 减少步骤：标记要删除的步骤
- [ ] 修改断言：修改现有步骤的断言条件
- [ ] 调整变量：修改变量提取规则或环境变量引用
- [ ] 方案展示时用 diff 视图标记新增(绿)/删除(红)/修改(黄)

---

## E8: Claude Code 集成

> MCP 工具扩展 + API Key 认证 + Skill 分发 + 连接配置

### S8.1: MCP 工具 — 接口测试生成

**FR**: FR1, FR33

**描述**: 在 MCP Server 中新增接口测试相关工具，供 Claude Code 调用。

**后端**:
- `mcp/tools/api_test_tools.py` — `tb_generate_api_test`, `tb_list_api_test_scenarios`, `tb_run_api_test`

**验收标准**:
- [ ] `tb_generate_api_test` 工具：接收接口定义 → 生成测试场景 → 返回场景列表
- [ ] `tb_list_api_test_scenarios` 工具：列出当前项目的测试场景
- [ ] `tb_run_api_test` 工具：执行指定场景并返回结果
- [ ] 工具注册到 MCP Server，Claude Code 可发现并调用

### S8.2: API Key 认证

**FR**: FR34

**描述**: MCP Server 外部访问需要 API Key 认证。

**后端**:
- API Key 生成/吊销 API
- MCP Server 请求认证中间件

**验收标准**:
- [ ] 用户可在设置页生成 API Key
- [ ] API Key 使用 SHA256 哈希存储（NFR5）
- [ ] MCP 请求需带 Bearer Token，未认证返回 401
- [ ] 用户可吊销已有 API Key
- [ ] 平台内部调用不需要 API Key（session 认证）

### S8.3: Skill 文件分发

**FR**: FR36

**描述**: 提供 Skill 文件的安装方式，支持一行命令安装或 ZIP 下载。

**验收标准**:
- [ ] Skill 文件 `tb-api-case-generate/SKILL.md` 完善且可用
- [ ] 平台提供 ZIP 下载链接
- [ ] 平台提供一行安装命令（下载到项目 `.claude/skills/` 目录）
- [ ] 安装说明清晰

### S8.4: Claude Code 连接配置页面

**FR**: FR35

**描述**: MCP 工具页面增强，展示 Claude Code 连接配置信息。

**前端**:
- `pages/settings/MCPTools.jsx` 增强

**验收标准**:
- [ ] 页面显示 MCP Server 地址
- [ ] 页面显示/生成 API Key
- [ ] 页面展示 MCP 配置片段（可复制）：`{"mcpServers": {"testbench": {"url": "...", "apiKey": "..."}}}`
- [ ] 页面展示 Skill 安装步骤 + 下载链接
- [ ] 操作步骤清晰：1. 复制配置 → 2. 安装 Skill → 3. 启动 Claude Code

---

## E9: 分支管理

> 项目级分支选择器 + 分支深拷贝

### S9.1: 项目级分支选择器

**FR**: FR41

**描述**: 分支选择器移到项目顶部栏，所有页面共享。

**前端**:
- `App.jsx` 顶部栏增加分支选择器

**验收标准**:
- [ ] 分支下拉在项目顶部栏（紧跟项目名称后）
- [ ] 切换分支 → 所有页面数据刷新为目标分支数据
- [ ] 默认选中 main 分支
- [ ] 下拉显示所有分支 + "新建分支"选项

### S9.2: 新建分支 + 深拷贝

**FR**: FR38, FR39, FR40, FR42

**描述**: 新建分支时可选择基于已有分支复制，勾选要复制的模块。

**后端**:
- `POST /projects/{id}/branches` — `{name, from_branch_id?, copy_modules: []}`
- `branch_copy_service.py` — 深拷贝逻辑

**前端**:
- BranchCopyModal 组件

**验收标准**:
- [ ] 新建分支弹窗：名称 + 基于分支(下拉) + 复制模块(checkbox)
- [ ] 复制模块：用例管理、接口测试、API 接口（显示各模块数量）
- [ ] 深拷贝：所有 ID 映射为新 ID，分支间完全独立
- [ ] 接口测试 `source_api_ids` 指向复制后的新 API ID
- [ ] 复制后场景状态重置为 draft，执行历史清空（FR42）

### S9.3: 分支数据隔离验证

**描述**: 确保分支间数据完全隔离，修改一个分支不影响另一个。

**验收标准**:
- [ ] 分支 A 新增场景 → 分支 B 看不到
- [ ] 分支 A 修改场景 → 分支 B 不受影响
- [ ] 分支 A 删除文件夹 → 分支 B 的同名文件夹不受影响
- [ ] 切换分支后，目录树和场景列表完全刷新

---

## E10: 状态审计与度量

> 版本更新操作 + 操作日志 + 生成质量度量

### S10.1: 场景版本更新 + 操作日志

**FR**: FR43, FR44

**描述**: 已发布场景需要修改时，通过"更新版本"复制为新草稿。关键操作记录到审计日志。

**后端**:
- `POST /api-tests/scenarios/{id}/new-version` — 复制为 draft，原版本 deprecated
- 操作日志集成已有审计系统

**验收标准**:
- [ ] 已发布场景详情页显示"更新版本"按钮
- [ ] 点击 → 复制为新场景(draft)，原场景自动 deprecated
- [ ] 新场景标题加版本标记（如"v2"）
- [ ] 生成/发布/废弃/删除操作记录到操作日志
- [ ] 操作日志在已有日志页面可查看

### S10.2: 生成质量度量

**FR**: FR46, FR45

**描述**: 记录场景从生成到发布是否被编辑过，统计"生成直接发布率"。

**后端**:
- `ApiTestScenario` 新增 `edited_after_generate` 布尔字段

**验收标准**:
- [ ] AI 生成的场景 `edited_after_generate = false`
- [ ] 用户编辑步骤后标记为 `true`
- [ ] 可查询统计：AI 生成且未编辑直接发布的数量 / AI 生成总数
- [ ] 生成失败时已完成的场景保留，失败原因可查看（FR45）

---

## Sprint 建议

### Sprint 1（基础 + 管理）
E1 全部 + E2 全部 + E3.1
→ 完成后可以：创建文件夹、创建场景、编辑步骤基本信息

### Sprint 2（编辑 + 生成）
E3.2-E3.4 + E4 全部
→ 完成后可以：完整编辑步骤、AI 生成测试场景

### Sprint 3（执行 + 报告）
E5 全部 + E6 全部
→ 完成后可以：执行测试、查看报告

### Sprint 4（智能 + 集成）
E7 全部 + E8 全部
→ 完成后可以：AI 优化场景、Claude Code 连接

### Sprint 5（分支 + 审计）
E9 全部 + E10 全部
→ 完成后可以：分支管理、操作审计、质量度量
