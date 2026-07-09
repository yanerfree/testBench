---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
version: '1.0'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd-func-test.md (v1.2)"
  - "_bmad-output/planning-artifacts/ux-design-func-test.md"
  - "_bmad-output/planning-artifacts/architecture-api-test.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "project-context.md"
  - "themisai/Aemeath 双仓勘察结论（PRD 对标分析章节）"
workflowType: 'architecture'
project_name: 'testBench 功能场景测试模块'
user_name: 'Dreamer'
date: '2026-07-08'
---

# Architecture Decision Document — testBench 功能场景测试模块

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 70 条 FR（含 1 条降级占位），11 个能力域

| 能力域 | FR | 架构含义 |
|--------|-----|---------|
| 需求输入与提取 | 1-6 | 文档预处理管线（噪声剥离/分块/消毒）、需求点实体 + 原文引用锚定、质量检测（软门禁） |
| 场景建模 | 7-12 | 场景模型持久化实体（四区块 JSONB）+ 确认状态机 + 增量补充生成 |
| 用例生成与落库 | 13-20 | 两段式流水线、测试点粒度任务项、去重比对、Case 模型扩展（source=ai） |
| 评审与门禁 | 21-28 | Case 审核状态机 + 拒绝理由结构化 + 并发冲突检测 + 批量操作 |
| 覆盖矩阵与追溯 | 29-33 | 需求点×维度聚合查询 + 双向追溯关系 + 单元格增量生成入口 |
| 生成任务管理 | 34-38 | job/item 状态机、断点续生成、成本预估、历史任务 |
| MCP 集成 | 39-42 | MCP 工具集复用 service 层（薄封装）、API Key 沿用 |
| 计划/报告 | 43-45 | 启用预留 report_type、零新增执行引擎 |
| 权限/审计/度量 | 46-50 | 复用 RBAC/操作日志/AIUsageLog + 质量统计聚合 |
| 生成质量纵深 | 51-59 | schema 校验层、静态质检器、AI 自评回炉、Reflection 补漏、生成档案 |
| 用户体验 | 61-70 | SSE 回放契约、任务恢复、深链路由 |

**Non-Functional Requirements（架构驱动力）：**

| NFR | 目标 | 架构影响 |
|-----|------|---------|
| NFR1/2 生成时延 | 提取/建模 <60s，单测试点 <30s | 逐测试点小批量 LLM 调用 + asyncio 受限并发 |
| NFR8 断点幂等 | 中断保留 + 续跑不重复 | item 级状态持久化，落库以 item 为幂等单元 |
| NFR9-11 可靠性 | 解析重试/评分降级/编号无冲突 | schema 校验重试环、评分异步化、编号取号加锁 |
| NFR12/13 容量 | 单任务 ≤100 需求点/≤200 用例；多任务并行 | 任务级信号量 + 项目间隔离 |
| NFR17 任务不僵尸 | 重启恢复/看门狗 | 任务注册表 + 启动扫描 + 超时判定 |
| NFR18 双通道一致 | MCP 不旁路 | MCP 工具只调 service 层，禁直写 DB |
| NFR19 prompt 单源 | 版本化 DB 事实源 | skill 版本表 + 双通道同源消费 |

### Technical Constraints & Dependencies

- **平台栈不可变**：React 19 + AntD / FastAPI + SQLAlchemy async + PostgreSQL / FastMCP / SSE（`api.stream`）
- **AI 调用必须走** `resolve_ai_config()` + `llm_client`（openai_compatible/anthropic 双协议），成本入 AIUsageLog
- **用例必须落既有 `Case` 模型**（TC 编号规则、CaseFolder 树、tea-cases.json 导入链路零破坏）
- **对标反决策（PRD 对标章节，架构层落实）**：不引 Celery/Redis、LangGraph/deepagents、pgvector/LightRAG、多智能体对抗、协议转换 sidecar；双通道单引擎

### Cross-Cutting Concerns

- **任务生命周期**：五阶段向导的每个中间产物都持久化，进程重启不丢——贯穿 models/services/SSE/前端恢复
- **SSE 回放**：所有长任务页面遵守"先全量状态、再增量事件"契约（UX 规范强依赖）
- **追溯链**：需求点 ↔ 测试点 ↔ 用例 ↔ 生成任务 ↔ prompt 版本，五级关系贯穿全部实体设计
- **阈值配置**：PRD 阈值表的 10 项参数需统一的配置读取链（项目级覆盖 → 系统默认）

## Technology Stack

**Brownfield — 全部继承平台既有技术栈，零新增重型组件。**

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + AntD + api.stream(SSE) | 新增页面沿用清新空灵风 tokens |
| 后端 | FastAPI + SQLAlchemy async | 后台任务 = 进程内 asyncio（ADR-1） |
| 数据库 | PostgreSQL + JSONB | 新增 pg_trgm 扩展（去重用，PG 自带，ADR-9） |
| AI | resolve_ai_config + llm_client | 新增统一的 schema 校验重试封装（ADR-4） |
| MCP | FastMCP + API Key（沿用） | 新增 tb_scenario_* 工具集（ADR-6） |

## Core Architectural Decisions

### ADR-1: 生成任务编排 — 进程内 asyncio + DB 状态机（拒绝 Celery）

**决策**：两段式生成走 FastAPI 进程内 `asyncio.create_task`，状态全部持久化到 DB；不引入 Celery/Redis。

**任务状态机**：
```
GenerationTask.status:
  extracting → model_ready → confirmed → generating
             → completed | partial_failed | failed | aborted
GenerationItem.status（一测试点一行）:
  pending → running → succeeded | failed | skipped(dedup)
```

**可靠性四件套**（NFR17，对标 Aemeath 事后补齐的教训，第一天就配全）：
1. 后台任务强引用集合 `_BG_TASKS`（防 GC 静默丢任务）
2. 单任务看门狗：`updated_at` 超时（默认 30min 无进展）→ 标记 failed + 透出原因
3. 启动孤儿扫描：进程启动时把 `generating/extracting` 状态且无活动任务的记录标 failed（用户可续跑）
4. item 级幂等：续跑从首个非 succeeded 的 item 开始，落库前查 item 状态防重复

**理由**：Aemeath 旗舰飞轮协调器自己就用 asyncio 绕开 Celery；20 人内网规模下 Celery 换到的能力 ≈ asyncio+DB 状态机，代价是双执行体系的全部复杂度税。

### ADR-2: 数据模型 — 五个新实体 + Case 扩展列（不建平行用例表）

```
requirement_docs        — 需求材料快照（content_markdown, source: paste|upload, task 1:1）
requirement_points      — 需求点（doc_id FK, code "R1", title, quote_text, quote_offset,
                          anchor_status: anchored|fuzzy|unanchored, status: active|not_applicable,
                          na_reason, created_by_ai bool）
scenario_models         — 场景模型（task_id FK, flows/state_transitions/role_matrix/test_points
                          四个 JSONB 区块, status: draft|confirmed|skipped, edited_fields JSONB）
generation_tasks        — 任务 job（project_id, branch_id, status, progress计数,
                          context_summary JSONB, token 预估/实耗, error_message）
generation_items        — 任务 item（task_id FK, test_point_ref, status, error_step,
                          error_message, case_id FK nullable, UNIQUE(task_id, test_point_ref)）
case_gen_events         — 生成档案（case_id FK, event_type: generated|scored|reviewed|
                          rejected|regenerated, payload JSONB{model,prompt_version,
                          requirement_point_ids,reason,score}, actor, created_at；append-only）

Case（既有表加列，Alembic 迁移，全部 nullable 兼容旧数据）:
  + review_status        VARCHAR(20)  — pending_review|approved|rejected（仅 source=ai 使用）
  + review_reason        JSONB        — {category, text, reviewer, at}
  + quality_score        JSONB        — {total, static, ai_self, warnings[]}
  + generation_task_id   FK nullable  — 血缘
  + requirement_point_ids JSONB       — 追溯（数组，跨表轻关联）
  + version              INTEGER      — 并发审核冲突检测（FR22）
```

**理由**：用例继续走 `Case`（PRD 硬约束）；追溯与任务域用独立小表，互不污染。`requirement_point_ids` 用 JSONB 数组而非关联表——MVP 查询方向单一（矩阵聚合由需求点侧发起），避免过早规格化；矩阵聚合用 GIN 索引足够 1 万用例规模（NFR12）。

### ADR-3: SSE 回放契约 — 状态快照 + 事件流水

**决策**：`task_events` 表持久化关键事件（含自增 seq），SSE 连接协议：

```
GET  /scenario-gen/tasks/{id}            → 全量当前状态（含已产出 item/用例列表）
GET  /scenario-gen/tasks/{id}/events?after_seq=N  (SSE)
     → 从 seq>N 回放，追平后转实时推送
```

前端进入/刷新/重连一律：先渲染全量状态 → 带最后 seq 订阅增量（FR63）。事件类型：`task_state / point_start / case_created / case_skipped / score_updated / point_failed / done`。单事件 payload ≤2KB（大对象只发 ID，前端按需拉取）。

**理由**：themisai 的"SSE 连接先查执行状态"模式 + Aemeath job_logs 表的结合；事件持久化同时服务任务详情页的历史时间线，一表两用。

### ADR-4: LLM 结构化输出 — 统一校验重试封装

**决策**：新增 `llm_structured()` 薄封装（包在 llm_client 之上，全模块唯一入口）：

```python
async def llm_structured(config, messages, schema: type[BaseModel], max_retry=2):
    for attempt in range(max_retry + 1):
        raw = await llm_client.complete(config, messages)
        try:
            return schema.model_validate_json(extract_json(raw))
        except ValidationError as e:
            messages = build_fix_messages(messages, raw, e)  # 只带 system+原始请求+错误，裁剪历史
    raise StructuredOutputError(last_error)
```

需求提取/场景建模/用例展开/AI 自评四个环节共用；批量展开时非法条目 skip+warning 不整批失败（FR53）。**禁止**从自由文本尾部捞 JSON（Aemeath 100+ 行打捞启发式的反面教训）。

### ADR-5: 质量评分流水线 — 静态同步 + AI 自评异步 + 回炉同步

```
用例展开(单测试点) → 静态校验器(纯函数,同步) → AI 自评(≥75?)
   ├─ 通过 → 落库(pending_review) + 档案事件 → SSE case_created
   └─ 不足 → 带评审意见回炉重生成(计数 ≤3, 代码强制) → 再评
落库后：合成总分写 quality_score（静态 50% + 自评 50%），失败降级"未评分"不阻塞（NFR10）
```

静态校验器规则集：模糊断言红线词、P0 占比钳制、步骤数/必填完整性、标题去重——纯函数零 token，独立可单测。

### ADR-6: 双通道单引擎 — MCP 工具是 service 层薄封装

**决策**：全部生成/落库/审核逻辑收敛在 `scenario_gen_service`；MCP 工具（`tb_scenario_create_task / tb_scenario_submit_model / tb_scenario_submit_cases / tb_scenario_query_matrix`）只做参数转换 + 调 service + 血缘标记（chat 通道带 session 标识）。MCP 通道产物同样走 schema 校验、自评门禁、pending_review 状态（NFR18）。

**理由**：Aemeath 双引擎（langgraph|claude_code）一方枯死 + themisai MCP toolset 复制压缩逻辑的漂移事故——通道可以有两个，引擎只留一个。

### ADR-7: Prompt/Skill 版本化 — DB 单一事实源（最小实现）

**决策**：沿用平台 skills 体系，新增 `tb-scenario-generate` 系列 preset（提取/建模/展开/自评四个 prompt 模板）；版本管理复用/扩展既有 SkillManage：`skill_versions` 表（skill_id, version, content, change_description, created_by），运行时取激活版本，preset 文件仅作首次种子导入。拒绝理由汇总 → 人工在 SkillManage 发布新版本（MVP 不做 AI 自动改 prompt）。

### ADR-8: 原文引用锚定 — 提取即锚定，三级降级（自研，无对标可抄）

```
1. LLM 提取需求点时强制输出 exact_quote（原文逐字片段）
2. 服务端 str.find(normalize(quote), normalize(doc)) → 命中存 offset，anchor_status=anchored
3. 未命中 → 空白规格化 + 最长公共子串 ≥80% → fuzzy（展示引用但标虚线）
4. 仍失败 → unanchored（需求点保留，引用区显示"未能定位原文"，不编造高亮）
```

**理由**：锚定失败必须诚实降级（FR68），绝不做"近似高亮"欺骗用户。

### ADR-9: 去重比对 — pg_trgm 相似度 + 规则复核（拒绝向量库）

**决策**：启用 PostgreSQL 自带 `pg_trgm` 扩展。展开生成的候选用例先按标题 trigram 相似度 ≥0.7 召回既有用例（同分支同模块范围），再按"步骤关键动作重叠 ≥50%"规则复核，命中→item 标 skipped 并记录对应 case_id（FR18）。不引 pgvector/embedding——召回场景是同模块内的短标题匹配，trigram 足够；效果不足时再评估（有数据再决策）。

### ADR-10: 明确不做清单（技术反决策，对标实证）

| 不做 | 反证来源 | 本模块替代 |
|------|---------|-----------|
| Celery/Redis 任务队列 | Aemeath 复杂度税 + 自家绕行 | ADR-1 asyncio+DB 状态机 |
| LangGraph/deepagents 编排 | Aemeath G1-G4 整套下线 | 直白函数流水线 |
| pgvector/LightRAG/知识图谱 | themisai 整体移除 + Aemeath 砍喂养者 | 文档直拼 prompt + pg_trgm + approved 样板 |
| 多智能体对抗评审 | 红蓝仲裁寿命 13 天 | 单次自评 + 人工门禁 |
| 协议转换 sidecar | claude-proxy 修复链 | llm_client 原生双协议 |
| 硬阻断需求门禁状态机 | gate_passed 死路 | FR5 软门禁（提示+确认） |
| 第二套用例表 | themisai 双轨审阅缠绕 | Case 扩展列，一套状态机 |

## Implementation Patterns & Consistency Rules

### 继承平台约定（同接口测试模块）

表名蛇形复数 / 列名蛇形 / API 路由蛇形 + `{"data": {...}}` 包装 / 前端 PascalCase 组件 + camelCase JSON / model→API 手动转换。

### 本模块新增约定

| 类别 | 约定 |
|------|------|
| API 路由前缀 | `/api/projects/{pid}/branches/{bid}/scenario-gen/...`（tasks / requirement-points / scenario-model / review / matrix） |
| 需求点编号 | `R{seq}`，任务内单调递增，展示用 |
| 用例编号 | 沿用 `TC-{MODULE}-{seq5}`（Case 既有取号逻辑，模块内加锁保 NFR11） |
| MCP 工具命名 | `tb_scenario_{动作}`：create_task / submit_model / submit_cases / query_matrix |
| SSE 事件 | `task_state / point_start / case_created / case_skipped / score_updated / point_failed / done`，payload ≤2KB |
| 测试维度枚举 | `positive / negative / boundary / permission / data / state`（封闭白名单，前后端共享常量文件） |
| 拒绝理由枚举 | `vague_expectation / unspecific_data / duplicate / misunderstood_requirement / other` |
| 阈值配置 | `scenario_gen_settings`（系统级默认常量 + 项目级 JSONB 覆盖，读取链：项目 → 系统默认），对应 PRD 阈值表 10 项 |
| 事件档案 | case_gen_events 只增不改；actor 取当前用户或 `ai`/`mcp:{key_name}` |

### 生成流水线（伪代码，无编排框架）

```python
async def run_generation(task_id):
    async with _task_semaphore:                    # NFR13 任务级并发限制
        task = load(task_id)
        model = load_confirmed_scenario_model(task)
        for point in pending_test_points(task):    # item 级断点续跑（ADR-1）
            item = mark_running(task, point)
            try:
                dup = dedup_check(point, existing_cases)          # ADR-9
                if dup: mark_skipped(item, dup); emit(case_skipped); continue
                for round in range(3 + 1):                        # FR56 回炉 ≤3
                    case_draft = await llm_structured(cfg, expand_prompt(point, ctx), CaseSchema)
                    warnings = static_validate(case_draft)        # ADR-5 静态
                    score = await ai_self_review(case_draft)      # ADR-5 自评
                    if score >= threshold: break
                case = persist_case(case_draft, pending_review, score, warnings)  # 落库
                append_gen_event(case, "generated", ...)          # 档案
                mark_succeeded(item, case); emit(case_created)
            except Exception as e:
                mark_failed(item, error_step, humanize(e)); emit(point_failed)   # 不阻塞后续
        finalize(task)                              # completed | partial_failed
```

### 上下文组装规则（prompt 输入侧）

1. 需求点原文引用直接前置塞入 prompt（不让 LLM 绕工具自取——Aemeath 仲裁的验证模式）
2. 风格样板：同模块 `status=已审核` 用例 top-3（FR58，approved-only）
3. 拒绝理由注入：同需求/同模块最近 5 条，安全隔离段包裹（FR26）
4. API 定义/业务规则按用户勾选拼入；全部组装结果生成 context_summary 供预览（FR37/67）

## Project Structure

### 新增文件

```
backend/app/
  models/
    scenario_gen.py           — RequirementDoc/RequirementPoint/ScenarioModel/
                                GenerationTask/GenerationItem/CaseGenEvent/TaskEvent
  api/
    scenario_gen.py           — 任务 CRUD/阶段推进/SSE/矩阵/审核端点
  services/
    scenario_gen/
      pipeline.py             — 任务编排（ADR-1 状态机 + 看门狗 + 孤儿扫描）
      preprocessor.py         — 噪声剥离/分块/消毒（FR51）
      extractor.py            — 需求点提取 + 引用锚定（ADR-8）
      health_check.py         — 三维质量检测 + 规则计分（FR5）
      modeler.py              — 场景模型生成（四区块）
      expander.py             — 用例展开 + 回炉环（ADR-5）
      static_validator.py     — 零 token 静态校验器（纯函数）
      dedup.py                — pg_trgm 去重（ADR-9）
      matrix.py               — 覆盖矩阵聚合查询
      review_service.py       — 审核状态机 + 并发版本检测 + 档案事件
      llm_structured.py       — schema 校验重试封装（ADR-4）
      settings.py             — 阈值配置读取链
  skills/preset/
    tb-scenario-extract/SKILL.md
    tb-scenario-model/SKILL.md
    tb-scenario-expand/SKILL.md
    tb-scenario-self-review/SKILL.md
  mcp/tools/
    scenario_gen.py           — tb_scenario_* 工具（薄封装，ADR-6）

frontend/src/pages/scenario-gen/   — 见 UX 规范组件清单（10 组件）
```

### 修改文件

```
backend/app/
  models/case.py              — Case 加 6 列（ADR-2，Alembic 迁移）
  api/cases.py                — 列表/详情返回审核字段；待审核筛选；审核端点（或并入 review_service）
  main.py                     — 注册 scenario_gen 路由 + 启动孤儿扫描钩子
frontend/src/
  pages/cases/CaseManagement.jsx  — 审核状态/评分列 + 待审核筛选
  pages/cases/CaseDetail.jsx      — 元信息面板 + 需求溯源/生成档案 Tab
  pages/report/…                  — report_type 启用「功能场景测试」筛选值（字段已预留）
  App.jsx / 路由                   — /scenario-gen 页面注册
```

### 数据模型关系

```
GenerationTask (1)──(1) RequirementDoc (1)──<(N) RequirementPoint
      │                                            │
      ├──(1) ScenarioModel（test_points 引用 point.code）
      ├──<(N) GenerationItem ──(0..1) Case（落库后回填 case_id）
      ├──<(N) TaskEvent（SSE 回放 + 时间线）
      │
Case（既有）+ review_status/quality_score/generation_task_id/requirement_point_ids/version
      └──<(N) CaseGenEvent（生成档案，append-only）

覆盖矩阵 = RequirementPoint × 维度枚举 ⟕ Case.requirement_point_ids (GIN) 聚合
TestReport.report_type 启用 'scenario_test'（字段已存在，零迁移）
```

## 风险审查要点（简版四方视角）

- **PM 视角**：MVP 裁剪线（PRD 已定）在架构上无耦合障碍——MCP 通道（ADR-6 薄封装可后置）、去重（dedup.py 独立可降级）、自动归类（expander 内独立函数）均可单独摘除
- **架构视角**：单进程 asyncio 的极限是长任务占用 event loop——LLM 调用全程 await 网络 IO，无 CPU 密集环节；唯一注意点是 pg_trgm 大表查询放 asyncio.to_thread 或确保索引命中
- **测试架构视角**：static_validator/extractor 锚定/dedup/llm_structured 均为纯函数或薄封装，可离线单测；E2E 依赖 llm-mock（Growth 已规划），MVP 用固定 fixture 注入 llm_client stub
- **开发视角**：Alembic 迁移全部 nullable 加列，可安全回滚；case_gen_events 与 task_events 是仅插入表，无锁竞争风险；编号取号沿用 Case 既有实现不重写
