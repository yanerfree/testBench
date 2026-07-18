# AI 用例生成质量闭环 — 完整规划

## 架构决策（2026-07-18 重大修正）

### 问题

之前的 step_generator 采用"LLM 看 Aria Snapshot 纯文本 → 猜选择器 → exec() 执行"架构，经过大量优化（静态校验、Snapshot 优先、选择器预验证、全角修复等）仍然无法可靠地生成真实操作代码。根因：

1. **Aria Snapshot 是静态文本**，下拉菜单/弹窗等动态元素抓不到
2. **LLM（haiku）从文本猜选择器**准确率不够，生成的代码以 wait_for_load_state + expect 为主，没有 click/fill
3. **exec() 不报错不代表操作成功**，导致大量假通过
4. **参考项目 ThemisAI 和 Aemeath 都不用这种方式**

### 正确方案（参考 ThemisAI + Aemeath）

**核心：Playwright MCP Agent 探索 → 记录真实选择器 → 拼脚本 → verify 验证**

```
ThemisAI 的做法（验证可行）：
1. LangGraph Agent + Playwright MCP Bridge 连接真实浏览器
2. Agent 通过 MCP 工具（browser_click/browser_fill/browser_snapshot）逐步操作
3. 每次操作后 MCP 返回的 Playwright 表达式原样记录（不让 LLM 猜）
4. 探索完后一次性拼成 TypeScript .spec.ts 脚本
5. submit_script → verify_script（npx playwright test）→ 失败修复重试最多 3 轮
6. 只有 verify 通过的脚本才保存

Aemeath 的做法（双引擎）：
1. LangGraph 引擎：同 ThemisAI
2. Claude Code 引擎：draft → execute → finalize/discard 状态机
3. 飞轮协调器批量编排
4. 病历系统（append-only 事件 + LLM 压缩）反哺后续生成
```

### 改造方向

1. **废弃 step_generator 的"LLM 猜选择器"模式**
2. **引入 Playwright MCP Bridge**（参考 ThemisAI 的 `mcp_bridge.py`，通过 SSE 连接 MCP Server）
3. **Agent 通过 MCP 工具真实操控浏览器**，从返回结果中提取选择器
4. **verify 验证**：生成后 `npx playwright test` 真实执行，不是 exec() 判定
5. **脚本转正**：只有 verify 通过才保存为 active

---

## 当前进度与目标差距

### 已完成
- [x] 接口测试模块 37 Stories 全部完成
- [x] MCP Server 20+ 个工具
- [x] 场景生成流水线（提取→建模→展开→自评→去重→静态校验）
- [x] tb-case-generate Skill v2（页面操作风格、质量规范、前置二分类、多角色标注）
- [x] MCP 全局 instructions + 自动步骤拆分
- [x] 后处理质量校验（模糊词/接口风格/P0比例）
- [x] Claude Code 通道打通
- [x] 前端 UI 测试 Tab（三视图 + SSE 进度 + 停止按钮 + 用户指导 + 截图展示）
- [x] 修复档案 + 修复经验回流
- [x] 多角色 Context 支持
- [x] SetupRef 造数持久化
- [x] AI 服务配置多模型（Haiku/Sonnet/Opus）

### 未完成（按优先级）
- [ ] **P0: MCP Agent 探索式脚本生成**（替代 step_generator 猜选择器）
- [ ] **P1: verify 验证机制**（npx playwright test 真实执行）
- [ ] **P2: 自愈机制完善**（三阶段诊断-分类-复盘，10 种失败类型）
- [ ] **P3: 前置数据管理**（setupRef + API Setup + Mock 集成）
- [ ] **P4: 飞轮批量编排**（job/item 两级 + 协调器 + 病历系统）

---

## 分阶段规划（修正版）

### 第一阶段：MCP Agent 探索式脚本生成（5-7 天）

**目标**：用 Playwright MCP Agent 真实操控浏览器，生成可执行的 Playwright 脚本。

**核心改造**（参考 ThemisAI `deep/__init__.py` + `mcp_bridge.py`）：

1. **Playwright MCP Bridge**
   - 通过 SSE 连接 Playwright MCP Server（`npx @playwright/mcp --port 8931`）
   - 动态发现 MCP 工具（browser_click/fill/snapshot/navigate 等）
   - 参考：`/home/dreamer/themisai/backend/app/agents/deep/mcp_bridge.py`

2. **Agent 探索流程**
   - Agent 接收用例步骤 + 环境信息
   - 通过 MCP 工具真实操作浏览器（不是从文本猜选择器）
   - 每次操作后 MCP 返回的 Playwright 表达式**原样记录**
   - 探索完后一次性拼成完整脚本
   - 参考：`/home/dreamer/themisai/backend/app/agents/deep/__init__.py` 第 357-381 行

3. **submit + verify 循环**
   - submit_script：Agent 把脚本写入 shared_state
   - verify_script：创建临时 Playwright 项目 → `npx playwright test` → 解析报告
   - 失败修复重试最多 3 轮
   - 参考：`/home/dreamer/themisai/backend/app/agents/deep/verify_tool.py`

4. **Fixture Shim**
   - authenticatedPage fixture：API 登录 + localStorage 注入，失败回退浏览器 UI 登录
   - cleanup fixture：LIFO 栈式清理回调
   - 参考：`/home/dreamer/themisai/backend/app/agents/deep/verify_tool.py` 第 25-213 行

**废弃**：
- `step_generator.py` 的"LLM 看 Aria Snapshot 猜选择器"模式
- `_validate_step_code` 的元素存在性检查（MCP 模式不需要）
- `_pre_verify_and_fix_locators` 的 locator.count() 预验证（MCP 用 ref 定位，天然唯一）

**改动范围**：
- 重写 `backend/app/services/ai/mcp_bridge.py`（参考 ThemisAI）
- 新建 `backend/app/services/ai/mcp_agent.py`（Agent 探索 + 脚本生成）
- 新建 `backend/app/services/ai/verify_tool.py`（npx playwright test 验证）
- 重写 `backend/app/services/ai/ui_script_gen_service.py`（接入新引擎）
- 修改 `backend/app/api/scripts.py`（generate-stream 接入新引擎）

**验证标准**（不再自欺欺人）：
- 生成后去目标系统确认数据存在（如搜索创建的服务名称）
- 保存的脚本中必须有 click/fill 操作
- captured_requests 中必须有创建/修改的 POST/PUT 请求
- 截图展示操作后的真实页面状态

---

### 第二阶段：Playwright 执行验证（3-5 天）

**目标**：用例生成后自动生成 Playwright 脚本并执行，用真实结果验证步骤是否正确。

**做法**：
1. 新建 `tb-ui-script-generate` Skill — 根据用例步骤生成 .spec.ts 脚本
2. 新建 `ui_script_service.py` — 管理脚本生成/存储/执行
3. 脚本执行环境：
   - 目标系统 URL 从环境配置读取（BASE_URL）
   - 登录凭据从环境变量读取（ADMIN_USER/ADMIN_PASS）
   - 用 Playwright 浏览器执行（headless）
4. 执行结果写回用例：
   - 通过 → 用例标记为"已验证"，脚本保存
   - 失败 → 用例标记为"待修正"，附带失败截图和错误日志

**改动范围**：
- 新建 `backend/app/skills/preset/tb-ui-script-generate/SKILL.md`
- 新建 `backend/app/services/ui_script_service.py`
- 新建 `backend/app/models/ui_script.py`（脚本存储模型）
- Case 模型扩展：`ui_scenario_status` 利用现有字段（draft/debugging/completed）
- MCP 新增工具：`tb_generate_ui_script`、`tb_run_ui_script`、`tb_get_ui_script_result`
- 前端用例详情页"UI 测试"Tab 展示脚本和执行结果

**依赖**：
- 目标系统可访问（有 URL）
- Playwright 已安装（`npx playwright install`）

**验证**：选 3 条已生成的用例 → 自动生成脚本 → 执行 → 查看通过/失败。

---

### 第二阶段：自愈机制完善（3-5 天）

**目标**：脚本执行失败后，AI 自动诊断、分类、修复，参考 Aemeath 的三阶段自愈。

**做法**（参考 Aemeath `ui-script-self-healing/SKILL.md`）：
1. **诊断**：读错误日志 + 截图 + 当前页面 Snapshot
2. **分类**（10 种失败类型判定表）：
   - 选择器失效 → 重新浏览器探索修复
   - Timeout → 检查元素是否存在，增加等待
   - 系统 Bug → 出 bug 报告
   - 用例过期 → 更新步骤
   - 外部依赖 → Mock
3. **复盘**：调 `record_healing` 工具持久化修复记录，反哺后续生成
4. 自愈历史注入到生成 prompt 的 `ui_healing_context` 字段

**参考代码**：
- `/home/dreamer/Aemeath/backend/app/agents/deep/healing_tool.py`
- `/home/dreamer/Aemeath/backend/app/services/_case_flywheel_heal_prompts.py`

---

### 第三阶段：前置数据管理（2-3 天）

**目标**：用例的前置条件自动准备/清理，参考 Aemeath 的 setupRef 全链路。

**做法**（参考 Aemeath `api_setup_runner_tool.py`）：
1. **setupRef 绑定**：用例前置条件关联已验证的 setup_code / teardown_code
2. **Agent 探索前执行 setup**：通过 `run_api_setup` MCP 工具真实创建数据
3. **脚本内联 setup/teardown**：生成的脚本顶部内联 setup 代码 + cleanup.add() 注册清理
4. **复用平台 Mock 工具**：外部依赖用 API Mock / LLM Mock 自动创建

**参考代码**：
- `/home/dreamer/themisai/backend/app/agents/deep/api_setup_runner_tool.py`
- `/home/dreamer/Aemeath/backend/app/services/ui_test_service.py` 第 32-117 行

---

### 第四阶段：飞轮批量编排（3-5 天）

**目标**：批量用例脚本生成/执行/自愈全自动，参考 Aemeath 飞轮协调器。

**做法**（参考 Aemeath `_case_flywheel_coordinator.py`）：
1. **Job/Item 两级模型**：Job = 批量任务，Item = 单用例，各自有状态机
2. **协调器**：进程内 asyncio（不用 Celery），Redis 租约分布式锁防双驱动
3. **Mode 分流**：create（新建脚本）/ heal（自愈已有脚本）
4. **Resume-by-step**：中断后恢复时检查 item 已完成的阶段，跳过已完成的
5. **心跳看门狗**：检测主协程 hang，自动释放锁
6. **病历系统**：每 item 完成后写病历（append-only Markdown + LLM 压缩）

**参考代码**：
- `/home/dreamer/Aemeath/backend/app/services/_case_flywheel_coordinator.py`
- `/home/dreamer/Aemeath/backend/app/services/case_flywheel_service.py`
- `/home/dreamer/Aemeath/backend/app/services/case_file_service.py`

**依赖**：第一到第三阶段全部完成。

---

## 时间线（修正版）

| 阶段 | 内容 | 预计时间 | 前置条件 |
|------|------|---------|---------|
| 一 | MCP Agent 探索式脚本生成 | 5-7 天 | 无 |
| 二 | 自愈机制完善 | 3-5 天 | 阶段一 |
| 三 | 前置数据管理 | 2-3 天 | 阶段一 |
| 四 | 飞轮批量编排 | 3-5 天 | 阶段一~三 |

**总计**：13-20 天

---

## 参考项目索引

| 项目 | 路径 | 核心文件 |
|------|------|---------|
| ThemisAI | `/home/dreamer/themisai/` | `backend/app/agents/deep/__init__.py`、`mcp_bridge.py`、`verify_tool.py`、`submit_tool.py` |
| Aemeath | `/home/dreamer/Aemeath/` | `backend/app/agents/deep/__init__.py`、`backend/app/services/_case_flywheel_coordinator.py`、`backend/app/services/case_file_service.py` |

## 每个阶段完成后的可用状态

| 完成到 | 用户体验 |
|--------|---------|
| 阶段一 | 点"AI 生成"→ Agent 真实操控浏览器 → 生成的脚本有 click/fill → 目标系统有新数据 → verify 通过才保存 |
| 阶段二 | 失败的脚本自动诊断分类修复，10 种失败类型各走不同路径 |
| 阶段三 | 不用手动准备测试数据，setup/teardown 自动执行 |
| 阶段四 | 批量全自动，飞轮协调器编排，病历系统反哺 |
