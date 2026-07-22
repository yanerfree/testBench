---
version: 0.1
date: 2026-07-20
status: draft
feature: ui-auto-single-case-100
relatedPRD: prd-ui-auto-100.md
relatedMemory: [project-uigen-b-100-and-data-model, project-uigen-gateway-and-engine]
---

# 架构设计 — UI/接口自动化：单用例100% + 自动化数据 + 场景变量

> 配套 [prd-ui-auto-100.md]。目标：单用例生成+执行 100% 可用。决策已锁：全局资源缺失=提示确认后补建；场景变量=新表；token=Redis；100%=代表用例集全通。

## 1. 数据模型

### 1.1 `scenario_variables`（新表，用例级，UI/接口共用）
| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | |
| case_id | uuid FK→cases | 归属用例（UI 与接口测试同一 case 共用这组变量） |
| name | varchar | 变量名，脚本以 `${name}` 引用 |
| kind | varchar | `literal`(固定值) / `random`(带随机后缀) / `global_ref`(引用全局) |
| value_template | text | literal: 原值；random: 前缀(运行时补 `_${runId}_${rand}`)；global_ref: 全局键名 |
| var_type | varchar | string/number/json |
| description | text | 调试可读 |
| created_at/updated_at | ts | |
- 约束：`(case_id, name)` 唯一。
- **不入表**：场景内"上一步提取→下一步用"的中间值走脚本内 extract，不建变量。

### 1.2 项目级自动化数据
- **凭证（多角色）**：复用现有 `environment_variables`（已有 ADMIN_/TENANT_USERNAME/PASSWORD）；角色→账号密码。**不新建**（避免与环境体系割裂）。
- **共享资源**：新表 `automation_resources`（项目级）
  | 列 | 说明 |
  |---|---|
  | id / project_id | |
  | name | 资源逻辑名（如 default-upstream） |
  | exists_check | JSON：存在性检查定义（查询接口 method/url + 判定字段/期望） |
  | create_def | JSON（可选）：创建接口 method/url + 参数模板 |
  | keep | bool=true（长期保留，绝不被测试删） |
- **token 缓存**：Redis，key=`autotoken:{project}:{env}:{role}`，value=token，TTL；执行期取；401 触发刷新（重登→回填）。

## 2. 生成期集成（CLI 引擎 cli_agent）
- 生成 task prompt 注入：该 case 的 `scenario_variables` 列表 + 项目 `automation_resources` 名单 + 可用凭证角色。
- 规则（已在 prompt 落地雏形，本 epic 结构化）：
  - **全局数据**：脚本用 `process.env['SV_<name>']` 或 `${global.<name>}` 引用；执行前预检存在。
  - **场景数据**：脚本自建（用 `SV_<name>` 的运行时唯一值命名）+ cleanup 自删；API 造数带鉴权（Redis token 注入为 `TEST_TOKEN`，脚本 `Authorization: Bearer ${process.env.TEST_TOKEN}`）。
- 生成完把"本用例识别出的场景变量"回写 `scenario_variables`（供接口测试共用 + 前端可编辑）。

## 3. 执行期集成（ts_runner / execute_single_case，AI-free）
执行前编排（新增 `resolve_run_context(case, env)`）：
1. **解析场景变量**：literal 直取；random 补 `_${runId}_${rand}`（runId=本次执行 id）；global_ref 查全局。
2. **预检全局资源**：对 case 依赖的 `automation_resources` 跑 exists_check → 缺 → 若有 create_def 则**提示用户确认**（执行返回"待确认前置数据"状态，不自动建）；齐 → 继续。
3. **注入**：BASE_URL + 角色凭证(TEST_USER/TEST_PASSWORD) + TEST_TOKEN(Redis) + 每个场景变量 `SV_<name>=<resolved>`。
4. 跑 `npx playwright test`（UI）/ pytest+httpx（接口）——**两者读同一份 resolved 变量**，无 AI。
- **有效性门禁**：verify/run 通过才转 active；不留脏数据（场景 cleanup + 唯一命名）；无假通过（已有绝对URL守卫）。

## 4. UI / 接口共用场景变量
- 同一 `case_id` 的 `scenario_variables` 被 UI 执行器与接口执行器都读取、同样 resolve。
- 接口测试脚本(pytest)里以 `os.environ['SV_<name>']` 取；UI 脚本(TS)里以 `process.env.SV_<name>` 取——同名同值。

## 5. 改动面（Story 边界预判）
- DB：新增 `scenario_variables`、`automation_resources`（alembic 迁移）。
- 后端：models + service（scenario var CRUD、resource 预检、token Redis 缓存、`resolve_run_context`）；生成/执行注入。
- 前端：用例页"场景变量"编辑区；项目设置"自动化数据"（凭证/共享资源）；执行前预检缺失的确认弹窗。
- 生成 prompt：结构化注入变量/全局/鉴权（替换现有临时 prompt 规则）。

## 6. 与参考项目对应（复用已验证思路）
- `scenario_variables` ≈ ThemisAI 场景 `extract`/变量；`automation_resources` + 预检 ≈ `ApiSetupConfig` + setup DAG（简化版：只查存在/按需建，不做完整 DAG）；token Redis ≈ `auth_manager` 缓存。

## 7. 分阶段（对齐 PRD Epic）
- Epic1：`environment_variables` 凭证规整 + `automation_resources` 表/CRUD + token Redis 缓存 + 预检 service。
- Epic2：`scenario_variables` 表/CRUD + 前端编辑 + 执行期 resolve + 注入。
- Epic3：生成期结构化注入（全局引用/场景自建带鉴权/唯一命名）→ 打通 00003 类硬用例。
- Epic4：执行期预检+门禁 → 代表用例集 100%。
- Epic5(低优)：批量 + UI/接口脚本区分。

## 8. 风险
- 生成期 agent 遵循结构化变量的稳定性（prompt 依赖）——用门禁 + 自愈兜底。
- 共享资源 exists_check/create_def 的通用性（不同资源查询各异）——先支持"服务/负载"等已知类型。
