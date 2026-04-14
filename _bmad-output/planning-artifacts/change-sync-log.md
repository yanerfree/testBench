---
title: "UX 设计阶段变更同步清单"
date: "2026-04-14"
source: "UX 设计规格 Step 3-8 讨论 + 原型验证"
status: "待同步"
---

# UX 设计阶段变更同步清单

**生成日期：** 2026-04-14
**来源：** UX 设计规格文档 Step 3-7 讨论 + React 原型验证
**状态：** 待各责任人确认

---

## 📋 给 John（产品经理）— PRD v3.3 需修订项

| 序号 | 变更内容 | 涉及 PRD 章节 | 优先级 | 状态 |
|------|---------|-------------|--------|------|
| 1 | **技术栈变更**：Vue 3 + Element Plus → React 18 + Ant Design 5 | 第七章 技术栈 | P0 | ⬜ 待更新 |
| 2 | **统计口径明确**：FR-REPORT-001 AC1 补充"统计单位为测试场景（以 `case_id` 为标识），非 HTTP 请求" | 5.8 FR-REPORT-001 | P0 | ⬜ 待更新 |
| 3 | **模块分组层**：FR-REPORT-001 AC2 明确"模块级汇总作为第二层展示，按模块→子模块分组" | 5.8 FR-REPORT-001 | P0 | ⬜ 待更新 |
| 4 | **通过率公式**：`passed / (passed + failed + error + flaky) × 100%`，skipped 和 xfail 不计入分母 | 新增到 5.8 或术语表 | P0 | ⬜ 待更新 |
| 5 | **状态枚举扩展**：从 passed/failed 扩展为 6 种：passed / failed / error / skipped / xfail / flaky | 5.7 FR-EXEC-002 | P0 | ⬜ 待更新 |
| 6 | **术语表新增**："测试场景"——以 `case_id` 为唯一标识的测试单元，一个场景包含 N 个有序步骤 | 第十二章 术语表 | P1 | ⬜ 待更新 |
| 7 | **用例详情交互**：进入即编辑模式，无编辑/查看切换；属性通过标题栏内联标签修改 | 新增到 5.3 或 UX 引用 | P1 | ⬜ 待更新 |
| 8 | **单用例执行**：用例详情页支持选择环境后直接执行单条用例（PRD 目前只描述了计划级执行） | 5.7 执行引擎 新增 FR | P1 | ⬜ 待更新 |

### 变更背景说明

- **技术栈变更原因**：原型阶段验证发现 Ant Design 与 Apifox 参考风格更契合，Design Token 主题定制能力更强，React 生态图表库（@ant-design/charts）与组件库视觉统一
- **统计口径变更原因**：用户（Dreamer）明确指出 Apifox 按接口请求统计不符合业务需求，应以"测试场景"为统计单元（如"3 个场景通过"而非"94 个请求通过"）
- **状态枚举扩展原因**：Party Mode 讨论中 Murat（测试架构师）指出 pytest 实际产生 6 种状态，仅 passed/failed 无法区分基础设施故障（error）和不稳定测试（flaky）

---

## 💻 给 Amelia（开发）— 技术实现要点

| 序号 | 变更内容 | 影响范围 | 优先级 | 状态 |
|------|---------|---------|--------|------|
| 1 | **技术栈**：React 18 + Ant Design 5 + @ant-design/charts + react-router-dom v6 + Vite | 全部前端 | P0 | ⬜ 待确认 |
| 2 | **报告 API 三层加载** | 后端 API 设计 | P0 | ⬜ 待确认 |
| 3 | **数据库三表拆分** | 数据模型 | P0 | ⬜ 待确认 |
| 4 | **场景状态枚举 6 种** | 后端聚合逻辑 | P0 | ⬜ 待确认 |
| 5 | **group 级 status 字段由后端计算** | API 响应结构 | P0 | ⬜ 待确认 |
| 6 | **失败优先排序由后端完成** | API 排序逻辑 | P1 | ⬜ 待确认 |
| 7 | **HTML 导出走异步任务队列** | 后端任务队列 | P1 | ⬜ 待确认 |
| 8 | **duration 统一毫秒，字段后缀 Ms** | API schema | P1 | ⬜ 待确认 |
| 9 | **截图存对象存储，detail 只返回 URL** | 存储方案 | P1 | ⬜ 待确认 |
| 10 | **用例详情页进入即编辑态 + Popover 内联属性** | 前端组件 | P1 | ⬜ 待确认 |
| 11 | **新增单用例执行 API**：`POST /api/cases/{caseId}/execute` | 新增 API | P1 | ⬜ 待确认 |
| 12 | **环境下拉数据来源**：`GET /api/environments` | API 对接 | P2 | ⬜ 待确认 |

### 报告 API 三层加载详细设计

| 端点 | 返回内容 | 触发时机 |
|------|---------|---------|
| `GET /api/reports/{id}` | summary + modules + scenarios（不含 steps） | 页面加载 |
| `GET /api/reports/{id}/scenarios/{sid}/steps` | 该场景全部 steps 轻量信息（名称、方法、URL、状态、耗时） | 展开场景 |
| `GET /api/reports/{id}/steps/{stepId}/detail` | 单个 step 的完整 request/response + assertions | 点击具体 step |

### 数据库三表设计

| 表名 | 内容 | 查询场景 |
|------|------|---------|
| `test_reports` | 报告元信息 + summary 聚合统计 | L1 仪表盘 |
| `test_report_scenarios` | 场景级信息 + 模块归属 + 状态 | L1 + L2 列表 |
| `test_report_steps` | 步骤详情 + request/response（JSONB） | L3 + L4 按需查询 |

### 场景状态聚合规则

场景状态取其内部步骤的最高优先级：`error > failed > flaky > xfail > skipped > passed`

---

## 🧪 给 Murat（测试架构师）— TEA 输出调整

| 序号 | 变更内容 | 影响范围 | 优先级 | 状态 |
|------|---------|---------|--------|------|
| 1 | **`api_requests` 嵌套进 step 对象** | TEA 脚本输出格式 | P0 | ⬜ 待确认 |
| 2 | **`case_id` 作为场景粒度锚点** | 用例计数逻辑 | P0 | ⬜ 待确认 |
| 3 | **状态枚举扩展为 5 种**（flaky 由平台判定） | TEA 输出 JSON | P0 | ⬜ 待确认 |
| 4 | **`duration_ms` 统一为挂钟时间** | TEA 输出 JSON | P1 | ⬜ 待确认 |
| 5 | **步骤可选 `phase` 字段** | TEA 输出 JSON | P2 | ⬜ 待确认 |
| 6 | **通过率公式确认** | 质量指标定义 | P1 | ⬜ 待确认 |

### TEA 步骤输出格式（修订后）

```json
{
  "case_id": "auth_login_redirect_to_dashboard",
  "status": "failed",
  "duration_ms": 3200,
  "steps": [
    {
      "seq": 1,
      "action": "访问 /login 页面",
      "status": "passed",
      "duration_ms": 800,
      "phase": "setup",
      "requests": []
    },
    {
      "seq": 2,
      "action": "输入正确邮箱和密码",
      "status": "passed",
      "duration_ms": 400,
      "phase": "action",
      "requests": []
    },
    {
      "seq": 3,
      "action": "点击「登录」按钮",
      "status": "failed",
      "duration_ms": 2000,
      "phase": "action",
      "error_summary": "预期跳转到 /dashboard，实际停留在 /login",
      "screenshot": "screenshots/step3.png",
      "requests": [
        {
          "method": "POST",
          "url": "/api/login",
          "status": 500,
          "duration_ms": 1203,
          "request_body": "...",
          "response_body": "..."
        }
      ]
    }
  ],
  "raw_stack_trace": "..."
}
```

**关键变更：** `requests` 从顶层平级数组移入每个 step 内部，明确哪个步骤触发了哪些 HTTP 请求。

---

## 变更追溯

| 决策来源 | 参与角色 | 日期 |
|---------|---------|------|
| UX Step 3 核心体验定义 | Sally(UX) + Dreamer | 2026-04-14 |
| Party Mode 多角色审视 | Winston(架构) + Amelia(开发) + Murat(测试) + John(PM) | 2026-04-14 |
| 原型验证 | Sally(UX) + Amelia(开发) + Dreamer | 2026-04-14 |
| Step 8 视觉基础 — 马卡龙色系 + 浅色顶栏 + 间距收紧 | Sally(UX) + Dreamer | 2026-04-14 |

### Step 8 新增变更（给 Amelia）

| 序号 | 变更内容 | 优先级 | 状态 |
|------|---------|--------|------|
| 13 | **配色全局替换为马卡龙色系**（主色 #6b7ef5，状态色见 UX 文档 Visual Design Foundation） | P0 | ⬜ 待确认 |
| 14 | **顶栏改为浅色**（白底 + 极淡底线，非深色） | P0 | ⬜ 待确认 |
| 15 | **间距全局收紧**（卡片间距 8px，内容区 padding 12px 16px） | P0 | ⬜ 待确认 |
| 16 | **标签配色规则**：统一浅底色+彩色字，不用深底色+白字 | P1 | ⬜ 待确认 |
| 17 | **按钮样式**：Ghost/Dashed 用 #5a6de8 加深，disabled 态 opacity 0.7 | P1 | ⬜ 待确认 |

### 功能补充变更（给 John + Amelia）

| 序号 | 变更内容 | 责任人 | 优先级 | 状态 |
|------|---------|--------|--------|------|
| 18 | **新增手动录入页面**：独立页面（非计划内嵌），左侧用例列表 + 右侧完整步骤展示 + 录入表单 | John(PRD补充) + Amelia(实现) | P0 | ⬜ 待确认 |
| 19 | **环境配置页面重设计**：Apifox 风格左右布局，新增 BASE_URL 独立字段 + 全局变量键值对表格 | John(PRD补充) + Amelia(实现) | P0 | ⬜ 待确认 |
| 20 | **环境变量优先级机制**：平台变量 > 脚本配置文件变量，后端执行引擎注入 os.environ | Amelia(后端) | P0 | ⬜ 待确认 |
| 21 | **脚本管理方式**：确定为 Git 拉取 + git worktree 并发隔离（方案 A），否决数据库存储（方案 B），混合模式（方案 C）v2 预留 | Winston + Amelia + Murat | P0 | ✅ 已确认 |
| 22 | **执行层架构**：主目录只做 pull 不做执行，每次执行用 `git worktree add --detach` 创建隔离快照，执行完异步清理 | Amelia(实现) | P0 | ⬜ 待实现 |
| 23 | **执行追溯**：每次执行记录 commit SHA，支持任意时间点复现 | Amelia(实现) | P1 | ⬜ 待实现 |

---

### 架构评审变更（架构 Step 3 + Party Mode）

| 序号 | 变更内容 | 责任人 | 优先级 | 状态 |
|------|---------|--------|--------|------|
| 24 | **FR-CASE-002 AC4 修改**：导入匹配键从 `script_ref.file` 改为 `tea_id`（唯一标识） | John(PRD修改) | P0 | ⬜ 待更新 |
| 25 | **新增"更新用例"按钮**：用例管理页新增 Git 自动拉取 tea-cases.json 导入功能 | John(PRD新增FR) + Amelia(实现) | P0 | ⬜ 待确认 |
| 26 | **项目设置新增字段**：JSON 文件路径（tea-cases.json 在仓库中的相对路径，默认根目录） | Amelia(实现) | P1 | ⬜ 待实现 |
| 27 | **python-jose → joserfc**：JWT 库替换，原库已停维有 CVE | Amelia(实现) | P0 | ⬜ 待实现 |
| 28 | **bcrypt 版本锁定 <4.1**：避免 passlib 兼容性冲突 | Amelia(实现) | P0 | ⬜ 待实现 |
| 29 | **engine/ 目录重构**：新增 sandbox.py、collector.py、command_builder.py；worktree 移至 services/ | Amelia(实现) | P1 | ⬜ 待实现 |
| 30 | **deps.py 拆目录**：deps/db.py + deps/auth.py + deps/worker.py | Amelia(实现) | P1 | ⬜ 待实现 |
| 31 | **新增横切模块**：core/pagination.py、core/permissions.py、core/health.py、schemas/common.py | Amelia(实现) | P1 | ⬜ 待实现 |
| 32 | **API 进程禁 subprocess.run**：阻塞调用走 arq Worker | Amelia(实现) | P0 | ⬜ 待实现 |
| 33 | **executor 超时机制**：timeout + process.kill() | Amelia(实现) | P0 | ⬜ 待实现 |
| 34 | **并发规模调整**：同时执行计划 5→20，在线用户 50→200 | John(PRD更新NFR) | P0 | ⬜ 待更新 |
| 35 | **任务队列**：arq + Redis，一期单机 4-6 Worker | Amelia(实现) | P0 | ⬜ 待实现 |

---

### 功能确认变更

| 序号 | 变更内容 | 责任人 | 优先级 | 状态 |
|------|---------|--------|--------|------|
| 36 | **模块管理改为导入自动生成**：导入 tea-cases.json 时自动创建 module/submodule 树结构，不需提前手动建模块 | John(PRD修改FR-MOD) + Amelia | P0 | ⬜ 待更新 |
| 37 | **用例导航树支持增删改**：右键重命名/删除/新建子模块，拖拽移动用例。取消独立模块管理页 | John(PRD修改) + Amelia(前端) | P0 | ⬜ 待更新 |
| 38 | **操作日志保留期确认 ≥ 1 年**：PRD NFR-DATA-003 已为 1 年，确认无误 | — | — | ✅ 已确认 |
| 39 | **测试计划支持删除**：已归档计划可彻底删除，二次确认弹窗 | John(PRD新增AC) + Amelia | P1 | ⬜ 待更新 |
| 40 | **测试报告支持删除**：报告可删除释放存储，二次确认弹窗 | John(PRD新增AC) + Amelia | P1 | ⬜ 待更新 |
| 41 | **自动化部署 Skill**：输出 Claude Code Skill，用户提供服务器地址+账号+安装路径，自动完成环境检查→安装→部署→启动→自检。支持 Linux + Windows | Amelia(实现) + Paige(文档) | P2 | ⬜ 待实现 |

---

*生成于 2026-04-14 · 来源：UX Step 3-8 + 架构 Step 1-3 + Party Mode 评审 + 功能确认讨论*
