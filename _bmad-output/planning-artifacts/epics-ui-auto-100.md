---
version: 0.1
date: 2026-07-20
status: draft
feature: ui-auto-single-case-100
relatedPRD: prd-ui-auto-100.md
relatedArch: architecture-ui-auto-100.md
---

# Epics & Stories — UI/接口自动化单用例100%

目标：单用例 生成+执行 100% 可用。Epic1/2 基础，Epic3/4 达标，Epic5 低优。每个 Story 完成后必须自测（改完真跑，遵守项目规矩）。

## Epic 1 — 项目级自动化数据（凭证 + 共享资源 + token + 预检）
- **S1.1** `automation_resources` 表 + alembic 迁移（project_id/name/exists_check/create_def/keep）。AC：迁移可升可降，模型可 CRUD。
- **S1.2** 资源 CRUD API + 前端"项目设置→自动化数据"页（列表/新增/编辑共享资源；凭证沿用环境变量、页面聚合展示多角色）。AC：能建一个"共享服务"资源并回读。
- **S1.3** token 回填服务：登录一次→Redis 缓存(key 按 project/env/role, TTL)→执行期取；401 刷新。AC：连续两次执行只登录一次；token 失效自动重登。
- **S1.4** 预检 service `check_resources(case, env)`：对用例依赖的资源跑 exists_check；缺→返回"待确认"清单（不自动建）。AC：缺资源时执行返回明确"待确认前置数据"，齐则通过。

## Epic 2 — 场景变量（新表，UI/接口共用）
- **S2.1** `scenario_variables` 表 + 迁移（case_id/name/kind/value_template/var_type/desc；(case_id,name) 唯一）。
- **S2.2** 场景变量 CRUD API + 前端用例页"场景变量"编辑区（增删改、看到 kind/模板/描述）。AC：给用例加 `svcName kind=random 前缀=svc` 能回读。
- **S2.3** 执行期 resolve：literal 直取；random 补 `_${runId}_${rand}`；global_ref 查全局。注入为 `SV_<name>`。AC：同一 case 两次执行 random 值不同且唯一；UI(process.env)与接口(os.environ)取到同名同值。

## Epic 3 — 生成期全局/场景 + 鉴权造数（打通硬用例）
- **S3.1** 生成 prompt 结构化注入：把该 case 的场景变量 + 项目资源名单 + 凭证角色 + token 用法喂给 cli_agent（替换现有临时 prompt 文本）。
- **S3.2** 生成规则固化：全局用 `SV_/${global}` 引用不删；场景自建(用 SV random 唯一名)+cleanup 自删；API 造数带 `Bearer ${process.env.TEST_TOKEN}`。AC：**TC-SVC-00003(禁用运行中服务) 生成的脚本能自建运行中服务(带鉴权,不 401)→禁用→自删，verify 通过**。

## Epic 4 — 执行期预检 + 门禁（单用例 100%）
- **S4.1** `resolve_run_context` 串起：预检全局(缺则待确认)→resolve 场景变量→注入(BASE_URL/凭证/TEST_TOKEN/SV_*)→跑。接 ts_runner 与接口执行器。AC：执行前自动预检+注入，日志可见注入了哪些变量。
- **S4.2** 有效性门禁 + 代表用例集验收：展示类/登录+创建类/状态变更类 各若干条，**AI 生成一次→反复执行(无 AI)全通**。AC：代表集通过率达标、无脏数据、无假通过。

## Epic 5（低优，B 达标后）— 批量 + UI/接口区分
- **S5.1** 前端多选用例→选择"执行 UI 脚本 / 接口脚本"→批量执行（复用 tb_run_ui_scripts_batch / 接口批量）。
- **S5.2** 用例页批量→自动建测试计划→报告；测试计划页建计划执行；确认两入口接通可用。

## 建议开发顺序
S2.1→S2.2→S2.3（场景变量最小闭环，UI/接口共用先落地）→ S1.1~S1.4（项目数据+token+预检）→ S3.1/S3.2（生成打通硬用例）→ S4.1/S4.2（执行100%）。每 Story 自测。
