---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd-func-test.md (v1.2)"
  - "_bmad-output/planning-artifacts/architecture-func-test.md"
  - "_bmad-output/planning-artifacts/ux-design-func-test.md"
  - "project-context.md"
status: complete
date: '2026-07-08'
---

# Epics & Stories — testBench 功能场景测试模块 MVP

> 需求基线：PRD v1.2（FR1-FR59、FR61-FR69 为 MVP；FR60 已降级为 NFR19；FR70 Growth）+ 架构 ADR-1~10 + UX 规范（九界面/组件清单）。

## Epic 概览

| # | Epic | Stories | FR/NFR 覆盖 | 依赖 |
|---|------|---------|------------|------|
| E1 | 基础设施与任务底座 | 5 | ADR-1/2/3/4、NFR17、FR34/53/63、阈值表 | 无 |
| E2 | 需求输入与需求点提取 | 5 | FR1-FR6、FR37/51/67、ADR-8 | E1 |
| E3 | 场景建模 | 3 | FR7-FR12、FR52/69 | E2 |
| E4 | 用例展开与质量流水线 | 8 | FR13-FR20、FR54-FR56/58、FR35/62、ADR-5/9 | E3 |
| E5 | 评审门禁 | 4 | FR21-FR28、FR46/64 | E4 |
| E6 | 覆盖矩阵与追溯全景 | 3 | FR29-FR33、FR57/65/66、FR12 | E4 |
| E7 | 计划报告与度量 | 3 | FR43-FR50、NFR15 | E5 |
| E8 | MCP/Claude Code 通道 | 2 | FR39-FR42、NFR18（PRD 裁剪线：可后置） | E4, E5 |
| E9 | Prompt 资产与版本化 | 2 | FR15/16/20/59、NFR19、ADR-7 | E1（贯穿 E2-E5） |

**总计：35 个 Stories**　覆盖检查（就绪审计后修正）：FR1-59、61-69 全覆盖；FR36/38 → S1.4/S2.1；FR47 → S7.3；FR49 → S1.3（写入）+ S7.2（统计）；FR50 → S5.1（记录）+ S7.2（统计）；FR41 → S8.1；NFR 由对应 Story 验收标准承载（NFR1-4/14/16 已补锚点）。

---

## E1: 基础设施与任务底座

> 数据模型、任务编排、SSE 回放、LLM 结构化封装、前端骨架——一切后续 Story 的地基（对标教训：可靠性四件套第一天配全，不事后补）

### S1.1: 数据模型与迁移

**FR**: FR11/17/57 底座　**ADR**: ADR-2

**描述**: 新建 7 张表（requirement_docs / requirement_points / scenario_models / generation_tasks / generation_items / case_gen_events / task_events）+ Case 扩展 6 列（review_status / review_reason / quality_score / generation_task_id / requirement_point_ids / version），Alembic 迁移。

**验收标准**:
- [ ] 7 张新表按 ADR-2 字段清单建模，generation_items 有 UNIQUE(task_id, test_point_ref)
- [ ] Case 新列全部 nullable，旧数据与既有导入/导出/计划流程回归通过（NFR15）
- [ ] requirement_point_ids 建 GIN 索引；case_gen_events / task_events 仅插入无更新路径
- [ ] 迁移可回滚（downgrade 验证）

### S1.2: 阈值配置读取链

**FR**: 阈值默认值表（FR5/6/38/54/56 消费）

**描述**: `scenario_gen_settings` 模块：系统级默认常量 + 项目级 JSONB 覆盖，读取链 项目 → 系统默认；PRD 阈值表 10 项参数全部收口于此。

**验收标准**:
- [ ] `get_setting(project_id, key)` 单入口，10 项参数常量与 PRD 阈值表一致
- [ ] 项目级覆盖可写可读（API + 简单设置 UI 或复用项目设置页）
- [ ] 单测覆盖默认/覆盖/非法值三路径

### S1.3: llm_structured 结构化输出封装

**FR**: FR53/FR49　**ADR**: ADR-4

**描述**: llm_client 之上的统一封装：Pydantic schema 校验 + 校验错误定向重试（≤2，读阈值配置）+ fix 轮上下文裁剪 + AIUsageLog 记账。

**验收标准**:
- [ ] 四类 schema（需求点/场景模型/用例/自评）定义为 Pydantic 模型，前后端枚举共享常量
- [ ] 校验失败重试携带错误信息且只保留 system+原始请求+错误（无历史累积）
- [ ] 重试耗尽抛 StructuredOutputError 含最后错误；批量场景单条失败不影响其他条目
- [ ] 每次调用写 AIUsageLog（token/耗时/模型/任务关联，FR49）
- [ ] llm_client stub 单测：合法/非法/重试成功/重试耗尽四路径

### S1.4: 任务编排底座 + SSE 回放

**FR**: FR34/35(骨架)/36/63　**ADR**: ADR-1/3　**NFR**: NFR13/17

**描述**: GenerationTask/Item 状态机 + 进程内 asyncio 驱动 + 可靠性四件套 + task_events 事件流水 + SSE 端点（全量快照 + after_seq 增量回放）。

**验收标准**:
- [ ] 任务状态机按 ADR-1 流转，非法流转被拒绝
- [ ] `_BG_TASKS` 强引用；看门狗按 updated_at 超时标 failed（原因可读）；启动孤儿扫描生效（重启后无永久"生成中"）
- [ ] `GET tasks/{id}` 返回全量状态；`GET tasks/{id}/events?after_seq=N` 先回放后实时；事件 payload ≤2KB
- [ ] 任务级信号量限制并行任务数；历史任务列表 API（FR36）
- [ ] 集成测试：kill 进程重启 → 任务被识别、可续跑
- [ ] SSE 事件从产生到推出 <2 秒（NFR4，本地环境实测）

### S1.5: 前端骨架 — 路由/任务中心/向导框架

**FR**: FR61(骨架)/68　**UX**: 任务中心 + WizardStepper

**描述**: `/scenario-gen` 页面注册、任务中心列表（状态/进度/恢复入口/空态）、五阶段 WizardStepper（阶段入 URL）、api.stream 扩展支持 after_seq 回放。

**验收标准**:
- [ ] 侧边栏「AI 智能→场景生成」入口 + 路由 `/projects/:pid/scenario-gen(/tasks/:taskId?stage=)`
- [ ] 任务中心表格：阶段/进度/用例数/创建人/时间；行点击恢复到任务当前阶段
- [ ] 空态含引导文案 + 新建按钮（诚实 UI：无假数据）
- [ ] WizardStepper 阶段状态与 URL 同步，已完成阶段可回看（只读）
- [ ] 前端 SSE 封装：断线自动重连并带最后 seq；重连提示条

---

## E2: 需求输入与需求点提取

> 五阶段向导的 ①②：输入 → 预处理 → 提取（锚定）→ 质量检测 → 确认

### S2.1: 需求材料输入（阶段①）

**FR**: FR1/2/37/38/67

**描述**: Stage1Input 组件 + 创建任务 API：粘贴/上传 .md、折叠的增强上下文（模块/API 选择/业务规则）、生成设置（目标文件夹/用例上限）、上下文组成预览与 token 成本预估。

**验收标准**:
- [ ] 粘贴文本或上传 .md 二选一，超长（>200k 字符）拦截提示
- [ ] 增强项默认折叠；API 选择复用既有 api-tree 选择器
- [ ] 提交前显示上下文组成（文档字数/API 数/样板数）与 token 预估
- [ ] 创建任务落 requirement_docs + generation_tasks（status=extracting）

### S2.2: 文档预处理管线

**FR**: FR6/51

**描述**: preprocessor：噪声章节剥离（评审记录/修订历史/附录等正则表）、标题感知分块（>16k 字符触发，块 16k）、输入消毒（控制字符/模板语法/长度）。

**验收标准**:
- [ ] 噪声章节表可配置，剥离结果在任务详情可见（剥了哪些章节）
- [ ] 分块边界优先落在标题处；跨块需求点提取结果合并去重（FR6）
- [ ] 消毒后内容进 prompt；纯函数单测覆盖三类处理

### S2.3: 需求点提取 + 原文引用锚定

**FR**: FR3　**ADR**: ADR-8

**描述**: extractor：LLM 提取需求点（llm_structured，强制 exact_quote）→ 服务端三级锚定（精确 offset → 空白规格化模糊 ≥80% → unanchored 诚实降级）→ 落 requirement_points。

**验收标准**:
- [ ] 需求点含 code(R{seq})/title/quote_text/quote_offset/anchor_status
- [ ] 锚定三级降级路径单测覆盖（含 quote 被 LLM 轻微改写的 fuzzy 案例）
- [ ] unanchored 需求点保留且 UI 显示"未能定位原文"（不假高亮）
- [ ] 提取进度经 SSE 推送（分块时按块推进）
- [ ] ≤10 页文档需求点提取 <60 秒（NFR1 基准埋点）

### S2.4: 需求质量检测（软门禁）

**FR**: FR5

**描述**: health_check：三维检测（逻辑矛盾/边界缺失/歧义）输出问题清单（分类/严重度/引用/建议），健康分由代码加权计算（critical-15/major-8/minor-3 基础 100），<70 触发确认提示；忽略/删除问题记操作人。

**验收标准**:
- [ ] 分数由代码从问题清单重算，不采信 LLM 自报分数
- [ ] 低于阈值仅改变 UI 文案（"仍要继续"），**无任何状态机阻断**（对标 gate_passed 死路教训）
- [ ] 问题项可勾选忽略/删除并重算分数，操作人入 case_gen_events 同款审计
- [ ] 问题清单含原文引用可回查

### S2.5: 需求点确认 UI（阶段②）

**FR**: FR4/69　**UX**: Stage2Requirements + QuoteDrawer

**描述**: 质量检测卡（健康分+问题展开）+ 需求点表格（行级增删改、合并）+ 手工框选原文新建需求点 + 原文引用抽屉（引用高亮）。

**验收标准**:
- [ ] 表格行内编辑 blur 自动保存；删除有确认
- [ ] 🔍 点击打开抽屉，原文滚动到引用处高亮；fuzzy 虚线样式；unanchored 显示提示
- [ ] 手工框选文档片段 → 新建需求点（quote 即所选文本，anchored）
- [ ] 主按钮"确认需求点，生成场景模型 →"推进任务状态

---

## E3: 场景建模

> 五阶段向导的 ③：两段式的第一段——模型生成、表格化确认、持久化恢复

### S3.1: 场景模型生成后端

**FR**: FR7/8/52　**ADR**: ADR-4

**描述**: modeler：基于需求点生成四区块（业务流程/状态转换/角色矩阵/测试点清单），测试点维度用封闭白名单枚举（服务层注入可选值 + 落库校验兜底），llm_structured 校验。

**验收标准**:
- [ ] 四区块 JSONB 落 scenario_models（status=draft）；任务状态 → model_ready
- [ ] 测试点必含 type(白名单)/priority/requirement_point_code/note；白名单外值被校验拒绝并重试
- [ ] 每需求点至少 1 个测试点，孤儿需求点在响应中标注（矩阵零覆盖的前身）
- [ ] 生成耗时与 token 入任务记录（NFR1 <60s 基准埋点）

### S3.2: 场景模型确认 UI（阶段③）

**FR**: FR9/10/69　**UX**: Stage3ScenarioModel

**描述**: 四 Tab 表格（流程/状态转换/角色矩阵/测试点），行级增删改，用户编辑行带 ✎ 标记（edited_fields），[跳过确认直接生成] 快捷路径（模型保留默认折叠）。

**验收标准**:
- [ ] 测试点 Tab 支持按需求点分组、维度 Tag 展示、增删改行
- [ ] 编辑 blur 保存到 scenario_models，✎ 标记持久
- [ ] 确认按钮带数量（"开始生成 N 条用例"）；跳过确认走同一状态流转（status=skipped）
- [ ] 状态转换/角色矩阵表格可编辑（最小实现：文本单元格）

### S3.3: 中间产物持久化与断点恢复验证

**FR**: FR11　**NFR**: NFR17

**描述**: 端到端验证：任一阶段离开/刷新/重启服务，从任务中心恢复到正确阶段，内容完好（对标 Aemeath "设计稿活在会话里"反例的验收级防守）。

**验收标准**:
- [ ] 阶段②③编辑一半离开 → 恢复后编辑内容在
- [ ] 服务重启 → extracting/generating 中的任务被孤儿扫描处理且可续跑
- [ ] E2E 用例覆盖"隔天回来继续"场景（时间无关性）

---

## E4: 用例展开与质量流水线

> 五阶段向导的 ④：核心 Epic——逐测试点展开 + 四层质量防线 + 双栏实时 UI

### S4.1: 展开流水线主循环

**FR**: FR13/14/15/16/17　**ADR**: ADR-1/5

**描述**: expander 主循环：按 item 逐测试点展开（llm_structured）→ 落 Case（source=ai, review_status=pending_review, 血缘/追溯字段）→ case_gen_events 档案 → SSE case_created；单条失败标 item 不阻塞。

**验收标准**:
- [ ] 用例含标题/优先级/前置/步骤(操作+单步预期)/整体预期/测试数据/设计方法标注/需求点引用
- [ ] 事实性内容缺失时输出"待确认"标注而非编造（prompt 约束 + 抽检验收）
- [ ] Case 落库走既有编号取号（TC-{MODULE}-{seq5}，并发无冲突 NFR11）
- [ ] item 状态/error_step/error_message 准确记录；单点失败后续继续
- [ ] 每条落库产生 generated 档案事件（模型/prompt 版本/需求点）

### S4.2: 静态校验器

**FR**: FR54

**描述**: static_validator 纯函数规则集：模糊断言红线词（内置词表+项目扩展）、P0 占比 >40% 自动降级、错误提示-消除配对检查、标题去重、必填完整性；warnings 挂任务与用例。

**验收标准**:
- [ ] 纯函数零 LLM 调用，规则可独立单测（每规则正反例）
- [ ] 红线词表读阈值配置（项目可增删）
- [ ] warnings 写入 Case.quality_score.warnings 并随 SSE score_updated 推送
- [ ] P0 降级动作记录 warning（可解释）

### S4.3: AI 自评回炉

**FR**: FR56/23

**描述**: 落库前四维加权自评（完整性30/准确性25/有效性25/可执行性20），<75 带意见回炉重生成（代码计数 ≤3），评分合成（静态50/自评50）写 quality_score；自评失败降级"未评分"不阻塞（NFR10）。

**验收标准**:
- [ ] 回炉轮数代码强制，第 3 轮仍不足则按最后版本落库并标 warning（不丢产物）
- [ ] 回炉时 prompt 带上一轮评审意见；上下文裁剪（不累积）
- [ ] quality_score JSONB 含 total/static/ai_self/warnings；"未评分"显示为 —（非 0）
- [ ] 评分分布可从任务详情查询（供 E7 统计）

### S4.4: 去重比对

**FR**: FR18/19　**ADR**: ADR-9

**描述**: dedup：pg_trgm 标题相似度 ≥0.7 召回（同分支同模块）+ 步骤动作重叠 ≥50% 复核；命中 → item=skipped 记录对应 case_id；结果摘要（新增/跳过/失败）。

**验收标准**:
- [ ] pg_trgm 扩展迁移启用；阈值读配置
- [ ] 跳过记录展示"与 TC-xxx 重复"可点击对照
- [ ] 任务完成摘要计数准确（新增/跳过/失败/重试）
- [ ] 降级开关：关闭去重时全部生成（PRD 裁剪线）

### S4.5: 自动归类与风格样板

**FR**: FR17/20/58

**描述**: 目标文件夹选择或 AI 按需求结构自动归类（CaseFolder 树）；风格样板 few-shot 只取同模块 status=已审核用例 top-3 注入 prompt。

**验收标准**:
- [ ] 用户选文件夹则直落；未选则按需求点结构建文件夹归类（复用 CaseFolder CRUD）
- [ ] 样板查询硬过滤已审核状态（approved-only，防污染回路）
- [ ] 无可用样板时優雅降级（不注入，不报错）

### S4.6: 断点续生成与容错

**FR**: FR35/19　**NFR**: NFR8/9

**描述**: 续跑入口（任务详情 [继续生成]）：从首个非 succeeded item 恢复；LLM 超时/截断的 item 可单独重试；完成态 completed/partial_failed 判定。

**验收标准**:
- [ ] 续跑不重复已成功 item（幂等验证）
- [ ] partial_failed 任务展示失败 item 清单（error_step+原因）+ 一键重试失败项
- [ ] 中断场景集成测试：mock LLM 超时 → 保留部分 → 续跑补齐
- [ ] 性能基准：单需求点展开 <30 秒，10 需求点抽样端到端耗时线性（NFR2）

### S4.7: 生成中双栏 UI（阶段④）

**FR**: FR62/13/68　**UX**: Stage4Generation

**描述**: 左栏进度流（按需求点分组、✓/⟳/○/✕ 状态、跳过项、可离开提示）+ 右栏产出卡片墙（实时追加高亮、评分徽标、维度 Tag、维度筛选）。

**验收标准**:
- [ ] 卡片随 SSE case_created 实时追加并高亮 1s；点击卡片预览用例
- [ ] 失败项红色 + 一行原因 + 续跑按钮；进度百分比与计数实时
- [ ] 刷新/断线回放后卡片全量恢复（S1.4 契约的页面级验证）
- [ ] 离开页面无确认拦截，任务中心行进度同步

### S4.8: Reflection 覆盖补漏

**FR**: FR55

**描述**: 展开完成后自动审查五类遗漏（边界/权限/并发/数据状态/跨功能）结合矩阵空格 → 补充建议清单 → 用户一键采纳生成（复用增量生成通道）。

**验收标准**:
- [ ] 建议含目标需求点/维度/理由；一键采纳创建增量 item 并生成
- [ ] 不采纳的建议可忽略（记录，不重复提示）
- [ ] 建议轮 token 消耗入任务成本

---

## E5: 评审门禁

> 五阶段向导的 ⑤ + 用例管理集成：AI 产物的人工质量闸门

### S5.1: 审核状态机后端

**FR**: FR21/22/25/27/28/46/50

**描述**: review_service：pending_review → approved/rejected 状态机（仅 source=ai 进入门禁）、拒绝必带结构化理由（枚举+文本）、version 乐观并发检测、编辑记录（edited_after_generate 语义）、批量审核、角色权限（审核角色可配置）、操作日志接入。

**验收标准**:
- [ ] 手动/导入用例不受门禁影响（review_status 为空即旧行为）
- [ ] 拒绝无理由被 422；理由枚举与 PRD 一致
- [ ] 并发审核：version 不匹配返回冲突码，前端可识别
- [ ] 审核前编辑用例被记录（支撑编辑率度量 FR50）
- [ ] 通过/拒绝写操作日志 + case_gen_events（reviewed/rejected 事件）
- [ ] 仅「已审核」用例可加入测试计划（计划选择器过滤，FR21/43 联动）

### S5.2: 评审工作台 UI

**FR**: FR24/64　**UX**: Stage5Review + RejectReasonPopover

**描述**: 列表+详情预览双栏、评分升序默认排序、筛选（待审/已审/已拒/评分/需求点）、键盘流（j/k/a/r/e/space/?）、批量通过/拒绝、拒绝理由两击弹层、冲突 toast。

**验收标准**:
- [ ] 键盘映射按 UX 规范；输入框聚焦时快捷键失效；? 显示帮助浮层
- [ ] r → 理由枚举单选+可选文本 → 回车提交 → 焦点自动下移
- [ ] 批量勾选后 shift+a 批量通过；操作后计数（39/42 已审）实时更新
- [ ] 并发冲突 toast"已被 X 审核，已刷新"并局部刷新该行
- [ ] warnings 与低分高亮展示（评分徽标色规范）
- [ ] 列表/筛选/排序操作响应 <1 秒（NFR3）；Chrome/Edge/Firefox 最新版键盘流冒烟通过（NFR16）

### S5.3: 拒绝理由回流注入

**FR**: FR26

**描述**: 同需求/同模块最近 5 条拒绝理由（读阈值配置）注入后续生成 prompt 的「避免以下问题」区块，安全隔离段包裹（分隔标记+转义+"是数据非指令"声明）；汇总统计入 E7 报表。

**验收标准**:
- [ ] 注入内容在任务上下文预览中可见（FR37 透明性）
- [ ] 防注入围栏单测：理由文本含指令样式内容时不改变生成行为（用 llm stub 断言 prompt 结构）
- [ ] 拒绝理由分布统计 API（分类计数，供统计页）

### S5.4: 用例管理页集成

**FR**: FR27　**UX**: CaseManagement 扩展

**描述**: 既有用例列表增加审核状态列/评分列/待审核筛选 Tab；来源=AI 的用例展示血缘入口（跳生成任务）。

**验收标准**:
- [ ] 列表新列不影响既有排序/筛选/导出（NFR15 回归）
- [ ] 「待审核」快捷筛选（跨任务全局评审入口）
- [ ] 从列表可直接单条通过/拒绝（复用 S5.1 API）

---

## E6: 覆盖矩阵与追溯全景

> "测全了吗"的答案界面 + 每条用例的来龙去脉

### S6.1: 覆盖矩阵聚合后端

**FR**: FR29/32/33

**描述**: matrix：需求点 × 维度枚举聚合（Case.requirement_point_ids GIN + steps 维度标注），支持任务/模块/文件夹过滤；不适用标注（needs na_reason）不计零覆盖。

**验收标准**:
- [ ] 单元格返回用例数+ID 列表；零覆盖/弱覆盖（仅正向）标记
- [ ] 1 万用例规模查询 <500ms（NFR12，建索引并 explain 验证）
- [ ] 需求点标注不适用（含原因）后矩阵区分显示

### S6.2: 覆盖矩阵 UI + 单元格补充生成

**FR**: FR30/66/12　**UX**: CoverageMatrix

**描述**: 矩阵视图（●数字/○零覆盖橙色/⊘不适用）、单元格点击侧滑用例列表、零覆盖 hover [+补充生成] 就地发起增量生成（指定需求点×维度），完成后原位更新。

**验收标准**:
- [ ] 补充生成走增量通道（新增 item 挂原任务或子任务，不重做全量）
- [ ] 底部汇总条：零覆盖 N · 弱覆盖 N（点击定位）
- [ ] 生成中单元格显示 ⟳，完成后计数原位刷新（SSE）
- [ ] 200 需求点 × 6 维度矩阵首屏渲染 <2 秒（NFR3）

### S6.3: 用例详情全景（CaseDetail 扩展）

**FR**: FR31/57/65　**UX**: 元信息面板 + 溯源/档案 Tab

**描述**: CaseDetail 增加元信息面板（来源/审核状态/评分/需求点/维度/执行次数/生成任务，计数可点击跳转）+「需求溯源」Tab（需求点+原文引用高亮，复用 QuoteDrawer）+「生成档案」Tab（case_gen_events 时间线）；用例 ID 与 Tab 入 URL 深链。

**验收标准**:
- [ ] `/cases/:caseId?tab=trace|archive` 可直接分享打开
- [ ] 溯源 Tab 从用例反查需求点及原文；需求点侧也能列出关联用例（双向，FR31）
- [ ] 档案时间线按事件类型图标区分（generated/scored/reviewed/rejected/regenerated）
- [ ] 非 AI 用例不显示 AI 相关区块（渐进增强，不惊扰旧流程）

---

## E7: 计划报告与度量

> 复用既有执行链路 + 让"AI 好不好用"可以被数据回答

### S7.1: 计划与报告集成

**FR**: FR43/44/45　**NFR**: NFR15

**描述**: 已审核用例进测试计划（选择器过滤）、执行走既有手动录入、报告启用 report_type=scenario_test（字段已预留）、报告关联展示需求覆盖信息。

**验收标准**:
- [ ] 报告列表类型筛选出现「功能场景测试」；旧报告不受影响
- [ ] 报告详情附本次执行覆盖的需求点及结果分布（读 requirement_point_ids 聚合）
- [ ] 既有计划/报告全流程回归通过（NFR15）

### S7.2: 生成质量统计

**FR**: FR48/50

**描述**: 统计视图：评审通过率、场景模型一次确认率、生成后编辑率、拒绝理由分布、发现遗漏场景数（手动标记）、token 成本汇总（AIUsageLog 聚合）。

**验收标准**:
- [ ] 指标计算单一来源（service 层函数，可单测）；空数据显示真实空态
- [ ] 按时间范围/模块过滤；通过率口径=未编辑直接通过（edited 语义参与）
- [ ] Measurable Outcomes 五项指标全部可从此页读出（PRD 验收锚点）

### S7.3: 审计与安全收尾

**FR**: FR47　**NFR**: NFR5/6/7

**描述**: 生成/审核/删除关键操作全量接入操作日志；日志脱敏检查；LLM 发送内容范围仅项目配置端点（复核）。

**验收标准**:
- [ ] 操作日志覆盖：创建任务/确认模型/生成完成/审核/拒绝/删除
- [ ] 日志与 AIUsageLog 无密钥明文（抽检）
- [ ] 游客角色只读验证（矩阵/统计/详情可看，操作按钮不出现）

---

## E8: MCP/Claude Code 通道（PRD 裁剪线：可后置 Phase 1.5）

> 双通道单引擎：MCP 是 service 层的薄封装

### S8.1: MCP 工具集

**FR**: FR39/40/41　**ADR**: ADR-6　**NFR**: NFR14/18

**描述**: `tb_scenario_create_task / tb_scenario_submit_model / tb_scenario_submit_cases / tb_scenario_query_matrix` 四工具，全部调 scenario_gen_service（含 schema 校验/自评门禁/pending_review），血缘标记 MCP 来源。

**验收标准**:
- [ ] MCP 提交的用例与平台通道数据结构完全一致，统一进评审队列
- [ ] 工具层无直写 DB 逻辑（code review 检查项）；绕过门禁的调用被 service 拒绝
- [ ] API Key 认证沿用；工具在 MCP 工具页面列表可见（FR41）
- [ ] 工具注册与调用兼容 MCP 2025-03-26 StreamableHTTP 规范（NFR14）

### S8.2: Claude Code Skill 分发

**FR**: FR42

**描述**: 功能场景生成的 Claude Code SKILL.md（指导读本地需求文档+源码 → 调 MCP 工具提交），接入既有 Skill 分发（一行命令/ZIP）。

**验收标准**:
- [ ] Skill 指令与平台 prompt 资产同源要点（不维护第二份规则拷贝，引用平台版本）
- [ ] 端到端演练：Claude Code 读需求文档 → 提交 → 平台评审通过

---

## E9: Prompt 资产与版本化（贯穿 E2-E5）

> PRD 判定：prompt 打磨占开发量 30%——单独立项管理

### S9.1: 四个生成 Skill prompt 编写与调优

**FR**: FR15/16/20/59（写作契约）

**描述**: tb-scenario-extract / tb-scenario-model / tb-scenario-expand / tb-scenario-self-review 四个 preset SKILL：融合可自动化写作契约（元素锚点/${变量}三段式/可验证关键词/一步一动作/步骤≤8/前置二分类）、设计方法标注、禁臆造规则、四维自评 rubric；用 testBench 自身需求文档试点调优（吃狗粮）。

**验收标准**:
- [ ] 四模板各含：角色/输入契约/输出 schema 说明/硬规范/正反例
- [ ] 试点需求文档跑通全链路，抽检 20 条用例写作契约符合率 ≥90%
- [ ] 试点评审通过率 ≥80%（PRD 成功标准的首次实测）
- [ ] 调优记录（改了什么/为什么）留档供后续迭代

### S9.2: Skill 版本化接入

**NFR**: NFR19　**ADR**: ADR-7

**描述**: 四 Skill 接入 skill_versions 表（DB 单源），preset 文件首次种子导入，SkillManage 页可查看/发布新版本，生成时记录所用版本号（进档案事件）。

**验收标准**:
- [ ] 运行时读 DB 激活版本；文件与 DB 不一致时以 DB 为准
- [ ] 档案事件 payload 含 prompt_version；统计页可按版本对比通过率（飞轮验证基础）
- [ ] 版本发布带 change_description，可回滚

---

## Sprint 建议

| Sprint | 内容 | 里程碑 |
|--------|------|--------|
| Sprint 1 | E1 全部 + S2.1/S2.2 | 底座就绪：任务可创建、SSE 回放可演示 |
| Sprint 2 | E2 完成 + E3 + S9.1(初版 prompt) | **第一个可演示闭环**：需求文档 → 需求点 → 场景模型确认 |
| Sprint 3 | E4 全部 + S9.1(调优) | **核心闭环**：模型 → 用例落库（含质量流水线、双栏 UI） |
| Sprint 4 | E5 + E6 + S9.2 | **MVP 功能完整**：评审门禁 + 矩阵 + 全景，试点验收（评审通过率实测） |
| Sprint 5 | E7 + E8 | 度量报表 + MCP 通道（若进度紧张按 PRD 裁剪线后置 E8） |

**裁剪对照（PRD 降级顺序 → Story）**：E8 整体后置 → S4.4 去重降级 → S4.5 自动归类降级为手选 → S4.3 评分降级为纯静态。

**验收基线**：Sprint 4 结束用 testBench 自身真实需求文档做全链路试点，实测 PRD Measurable Outcomes 五项指标。
