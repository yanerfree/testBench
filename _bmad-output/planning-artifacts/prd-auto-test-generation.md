# 需求文档：AI 驱动的测试脚本自动生成 + 用例-脚本-报告全链路打通

> 版本：v2.0 · 日期：2026-05-19 · 优先级：紧急

---

## 1. 背景

testBench 是一个测试管理平台，目前已具备用例管理、执行计划、报告生成等能力。存在两大痛点：

### 痛点 A：脚本编写效率低

| 现状 | 期望 |
|------|------|
| 一个模块的 API 测试脚本需要 1-2 天 | AI 分钟级生成 |
| 人工容易遗漏异常路径 | AI 按规则自动推导正向+异常场景 |
| 不同人写的脚本风格不同 | 严格遵循 project-context.md 规范 |

### 痛点 B：用例-脚本-报告割裂（核心痛点）

| 现状 | 期望 |
|------|------|
| 自动化用例只有脚本路径，平台上看是"空壳" | 每条用例有清晰可读的步骤描述 |
| 执行报告只有 pass/fail，无步骤级下钻 | 报告有步骤时间线，失败步骤可展开详情 |
| 脚本中的 Given/When/Then 注释与平台步骤割裂 | 脚本 → 用例 → 报告三层数据统一 |
| tea_capture 只捕获 HTTP 请求路径，无业务语义 | 步骤名称是业务语义（如"创建用户"） |

---

## 2. 目标

### 2.1 核心目标

1. **tea_step 机制** — 引入 `tea_step` 上下文管理器，作为脚本中标记业务步骤的唯一机制
2. **API 脚本自动生成** — 扫描后端路由，推导场景，生成带 `tea_step` 的 pytest 脚本
3. **UI 脚本自动生成** — Playwright 探索页面，生成带 `tea_step` 的 E2E 脚本
4. **全链路打通** — 脚本步骤 → tea-cases.json → 平台用例 → 执行报告步骤，形成闭环

### 2.2 非目标

- 不做 step_extractor（从旧脚本注释中自动解析步骤）
- 不做 Playwright action 自动捕获（二期）
- 不做平台 UI 入口（本期通过 Claude Code Skill 触发）
- 不做旧脚本自动迁移（手动渐进增强）

---

## 3. 核心设计决策（团队讨论定稿）

| # | 决策项 | 结论 | 理由 |
|---|--------|------|------|
| 1 | 步骤标记机制 | `tea_step` 上下文管理器 | 比装饰器粒度更细，一个函数内可标记多步骤 |
| 2 | tea_step 位置 | 独立文件 `engine/plugins/tea_step.py` | 单一职责，与 tea_capture.py 分离 |
| 3 | phase 值域 | `setup` / `action` / `verify` | 工具语义优于方法论语义，排查问题更直觉 |
| 4 | tea-cases.json | 包含 steps 数据 | 离线可见，导入链路简单，生成时同步写入 |
| 5 | TestReportStep 新增列 | `step_label` + `step_phase` | label 展示业务名称，phase 支持分组统计 |
| 6 | 旧脚本处理 | 不解析，显示为单步骤 | 渐进增强，避免脆弱的注释解析器 |
| 7 | CI 质量门禁 | JSON steps 与脚本 tea_step 一致性校验 | 信任但验证 |

---

## 4. 功能需求

### FR-1：tea_step 核心模块

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.1 | `tea_step(name, phase)` 上下文管理器 | 自动计时、异常捕获、状态标记 |
| FR-1.2 | 步骤栈 `_step_stack`，支持 tea_capture 感知当前步骤 | HTTP 请求归入当前业务步骤的 requests 下 |
| FR-1.3 | `get_steps()` / `reset()` API | 用于 pytest 插件在测试结束时收集步骤 |
| FR-1.4 | 向后兼容 | 不使用 tea_step 的旧脚本行为完全不变 |

### FR-2：tea_capture 增强

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-2.1 | 感知 tea_step 栈 | 有 tea_step 时 HTTP 请求挂到 step.requests 下 |
| FR-2.2 | 输出双层 JSON | 有 tea_step: `[{action, phase, requests:[...]}]`；无: 保持原格式 |
| FR-2.3 | pytest_runtest_teardown 合并输出 | tea_step 步骤优先，无 tea_step 时降级为 HTTP 步骤 |

### FR-3：result_parser + 执行引擎适配

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-3.1 | parse_step_json 支持新格式 | 识别 action+requests 嵌套结构 |
| FR-3.2 | 映射 step_label（action 字段）和 step_phase | 传递到 TestReportStep 入库 |
| FR-3.3 | executor.py 注入 tea_step.py 到沙箱 | 与 tea_capture.py 同一注入路径 |

### FR-4：数据库迁移

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-4.1 | TestReportStep 加 step_label VARCHAR(500) | nullable，旧数据兼容 |
| FR-4.2 | TestReportStep 加 step_phase VARCHAR(20) | nullable，值域 setup/action/verify |

### FR-5：API 脚本自动生成（Skill）

与 v1.0 PRD 的 FR-1 相同，额外要求：
- FR-5.1 生成的脚本使用 `with tea_step(...)` 包裹步骤
- FR-5.2 tea-cases.json 每条记录包含 `steps` 数组

### FR-6：UI 脚本自动生成（Skill）

与 v1.0 PRD 的 FR-2 相同，额外要求：
- FR-6.1 生成的脚本使用 `with tea_step(...)` 包裹步骤
- FR-6.2 tea-cases.json 每条记录包含 `steps` 数组

### FR-7：用例导入增强

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-7.1 | 导入 tea-cases.json 时读取 steps 字段 | 写入 Case.steps |
| FR-7.2 | Case.steps 格式统一 | `[{seq, action, phase, expected}]` |

---

## 5. 数据流闭环

```
  Skill 生成脚本              tea-cases.json              平台用例
    with tea_step(...)  →   steps: [{action,phase}]  →  Case.steps
         │                                                  │
         ▼                                                  ▼
    pytest 执行                                        用例详情页
         │
    tea_step.py 输出步骤 JSON
    tea_capture.py 挂 HTTP 请求到步骤下
         │
         ▼
    result_parser.py 解析 → TestReportStep 入库
                             (step_label + step_phase)
                                    │
                                    ▼
                              报告步骤时间线
                              失败步骤展开详情
```

---

## 6. 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M1 | 设计规范 + Skill 定义 | ✅ 完成 |
| M2 | 团队讨论确定最终方案 | ✅ 完成 |
| M3 | tea_step.py + tea_capture 增强 + 解析器适配 + DB migration | ⬜ 开发中 |
| M4 | Skill 模板更新 + 用例导入增强 | ⬜ 待做 |
| M5 | 用 auth 模块实际验证全链路 | ⬜ 待做 |
| M6 | 前端报告展示增强（L3 步骤时间线 + L4 详情面板） | ⬜ 二期 |

---

## 7. 改动文件清单

| # | 文件 | 改动 | 工作量 |
|---|------|------|--------|
| 1 | `engine/plugins/tea_step.py` | **新建** | 小 |
| 2 | `engine/plugins/tea_capture.py` | 增强 | 小 |
| 3 | `engine/result_parser.py` | 适配新格式 | 小 |
| 4 | `engine/executor.py` | 注入 tea_step.py | 很小 |
| 5 | `engine/tasks/execution.py` | 传递新字段 | 很小 |
| 6 | `models/report.py` + Alembic | 加列 | 小 |
| 7 | 用例导入逻辑 | 读取 steps | 小 |
| 8 | generate-api-tests SKILL | 模板更新 | 中 |
| 9 | generate-ui-tests SKILL | 模板更新 | 中 |
