# AI 用例生成质量闭环 — 完整规划

## 当前进度与目标差距

### 已完成
- [x] 接口测试模块 37 Stories 全部完成
- [x] MCP Server 20 个工具（项目/分支/用例/接口/环境/报告/生成）
- [x] 场景生成流水线（提取→建模→展开→自评→去重→静态校验）
- [x] tb-case-generate Skill v2（页面操作风格、质量规范）
- [x] MCP 全局 instructions（Claude Code 连上自动知道流程）
- [x] 后处理质量校验（模糊词/接口风格/P0比例）
- [x] Claude Code 通道打通（生成弹窗 Claude Code Tab）

### 未完成（按优先级）
- [ ] **P0: 用例步骤准确性** — AI 写的按钮名/字段/Toast 可能不对，需要基于真实页面
- [ ] **P1: Playwright 执行验证** — 生成后跑一次，用真实结果修正用例
- [ ] **P2: 自愈机制** — 失败后自动诊断→分类→修复→重跑
- [ ] **P3: 前置数据管理** — API Setup 自动准备/清理测试数据
- [ ] **P4: 飞轮** — 用例→UI脚本→API脚本→执行→自愈→仲裁 全自动

---

## 分阶段规划

### 第一阶段：用例步骤准确性（1-2 天）

**目标**：AI 生成的每个步骤（按钮名称、字段标签、Toast 文案）与真实页面一致。

**做法**：
1. Claude Code 通过 Skill 的 Step 1 **强制读项目前端代码**（组件文件、路由文件），提取：
   - 页面有哪些按钮（文字内容）
   - 表单有哪些字段（label/placeholder）
   - Toast/提示文案
   - 弹窗标题
2. 把提取到的页面信息作为上下文传给用例生成
3. 生成的步骤引用的元素名称必须来自真实代码，不能编造

**改动范围**：
- `tb-case-generate/SKILL.md` Step 1 强化：加前端代码读取步骤
- MCP instructions 补充：列出读取前端代码的具体文件路径模式

**验证**：用网关管理系统生成 3 条用例，人工对比步骤中的按钮名/字段名是否与真实页面一致。

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

### 第三阶段：自愈机制（3-5 天）

**目标**：脚本执行失败后，AI 自动诊断原因并修复，最多 3 轮。

**做法**：
1. 新建 `tb-ui-self-healing` Skill — 三阶段工作流：
   - 诊断：读错误日志 + 截图，定位失败原因
   - 分类：系统 Bug / 脚本 Bug / 用例过期
   - 处置：
     - 系统 Bug → 出 bug 报告，不改脚本
     - 脚本 Bug → 最小化修复 → 重跑
     - 用例过期 → 更新用例步骤
2. 修复档案（healing archive）：每次修复留档，反哺 Skill 改进
3. 最多 3 轮自愈，还不行就仲裁

**改动范围**：
- 新建 `backend/app/skills/preset/tb-ui-self-healing/SKILL.md`
- 新建 `backend/app/models/healing_archive.py`（修复档案模型）
- `ui_script_service.py` 扩展：自愈循环逻辑
- MCP 新增工具：`tb_diagnose_ui_failure`、`tb_record_healing`

**验证**：故意制造一个按钮名称不对的用例 → 脚本执行失败 → 自愈 → 修正后通过。

---

### 第四阶段：前置数据管理（2-3 天）

**目标**：用例的前置条件（"已创建服务 X"）自动通过 API 准备，后置自动清理。

**做法**：
1. 新建 API Setup 模型 — 可复用的前置数据代码片段
   - 每个 Setup 有：名称、实体类型、创建代码（API 调用）、清理代码、参数 schema
   - 例："createService" → POST /api/v1/services + DELETE /api/v1/services/:id
2. 用例的 preconditions 可绑定 setupRef
3. 脚本执行前自动运行 setup 代码创建数据，执行后运行 teardown 清理

**改动范围**：
- 新建 `backend/app/models/api_setup.py`
- 新建 `backend/app/services/api_setup_service.py`
- MCP 新增工具：`tb_create_api_setup`、`tb_run_setup`、`tb_run_teardown`
- `ui_script_service.py` 集成：执行前后自动调用 setup/teardown
- 前端用例详情页展示 setupRef 绑定状态

**验证**：一条需要"已创建服务"的用例 → 执行时自动创建服务 → 测试 → 自动删除服务。

---

### 第五阶段：飞轮（3-5 天）

**目标**：批量选择用例 → UI 脚本生成/执行/自愈 → 接口流量提取 → 接口测试编排 → 全自动。

**做法**：
1. 飞轮协调器 — 批量任务编排
2. UI 执行时拦截 API 请求 → 提取真实接口调用
3. 提取的接口编排成接口测试场景（真实参数+断言）
4. SSE 实时进度推送
5. 前端飞轮面板：进度、结果、诊断

**依赖**：第一到第四阶段全部完成。

---

## 时间线

| 阶段 | 内容 | 预计时间 | 前置条件 |
|------|------|---------|---------|
| 一 | 步骤准确性 | 1-2 天 | 无 |
| 二 | Playwright 执行验证 | 3-5 天 | 阶段一 |
| 三 | 自愈机制 | 3-5 天 | 阶段二 |
| 四 | 前置数据管理 | 2-3 天 | 阶段二 |
| 五 | 飞轮 | 3-5 天 | 阶段一~四 |

**总计**：12-20 天

---

## 每个阶段完成后的可用状态

| 完成到 | 用户体验 |
|--------|---------|
| 阶段一 | 说"生成用例"→ 步骤与真实页面一致，可直接用于手工测试 |
| 阶段二 | 生成的用例自动跑一次验证，通过的才保留 |
| 阶段三 | 失败的自动修，减少人工排查 |
| 阶段四 | 不用手动准备测试数据了 |
| 阶段五 | 批量全自动，接口测试也自动编排 |
