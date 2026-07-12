---
version: 1.0
date: 2026-07-11
status: approved
source: party-mode-consensus
relatedEpics: [Epic 4, Epic 5]
---

# PRD：用例执行体系补全

## 一、背景

现有 Epic 4（测试计划与执行引擎）和 Epic 5（报告与通知）已覆盖"测试计划 → 执行 → 报告"的完整链路。但用户在实际使用中有两个高频场景未被覆盖：

1. **用例列表批量执行** — 不想创建计划，选几条用例立即跑，看报告
2. **用例详情页调试** — 写完脚本想马上试一下，不需要留痕

这两个场景的本质区别是**是否需要留痕**：批量执行入报告，调试不入报告。

## 二、场景定义

### 场景 A：批量执行（入报告）

**用户意图：** "我现在就想跑一下这几个用例看结果"

**核心规则：**
- 不创建测试计划，一次性执行
- 必须选择执行类型（API / UI）和环境
- 无对应脚本的用例自动跳过，报告中标记 `skipped`
- 生成正式测试报告，与计划执行的报告格式完全一致
- 报告在"测试报告"页面可查看，来源标注为"批量执行"

### 场景 B：单用例调试（不入报告）

**用户意图：** "我刚改完脚本，马上试一下对不对"

**核心规则：**
- 在用例详情的"接口测试"Tab 或"UI测试"Tab 内触发
- 类型由 Tab 上下文决定，不需要额外选择
- 必须选择环境
- 结果内联展示在当前 Tab，不写入报告系统
- 可反复执行，用完即焚

## 三、交互设计

### 3.1 批量执行交互流

```
用例列表勾选 N 条
  → 操作栏出现「批量执行」按钮
  → 点击弹出对话框：
    ┌─────────────────────────────────┐
    │ 批量执行                         │
    │                                 │
    │ 执行类型：  [API] [UI]          │
    │ 执行环境：  [下拉选择]           │
    │                                 │
    │ 共选中 20 个用例                 │
    │ 其中 15 个包含 API 脚本          │
    │ 5 个无脚本，将被跳过             │
    │                                 │
    │        [取消]  [开始执行]         │
    └─────────────────────────────────┘
  → 确认后跳转到新生成的报告详情页
```

**关键决策：**
- 执行类型用 Segmented 切换，切换时实时更新"有脚本/无脚本"计数
- 环境必选，记住上次选择（useEnv 项目级持久化）
- 确认后跳转报告详情页（复用计划报告组件），不用弹窗展示结果
- 无脚本用例不阻断执行，报告中标记 skipped

### 3.2 单用例调试交互流

```
用例详情 → 接口测试 Tab
  → Tab 内编辑器右上角：[环境下拉] [▶ 运行]
  → 点击运行 → 内联展示结果（步骤级、断言级）
  → 可反复点击运行

用例详情 → UI测试 Tab
  → 同上，类型自动为 UI
```

**关键决策：**
- 删除顶栏的通用"执行"按钮，执行入口下沉到各自 Tab
- 环境选择器紧挨运行按钮，记住上次选择
- 结果内联展示，不污染"执行历史"Tab
- 保持现有 `scripts/run` 接口不变

## 四、数据模型变更

### 4.1 `test_reports` 表

```sql
ALTER TABLE test_reports
  ALTER COLUMN plan_id DROP NOT NULL;  -- 允许无计划的报告
  ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'plan';  -- plan | adhoc
  ADD COLUMN title VARCHAR(200);  -- adhoc 时存"批量执行-时间戳"
```

### 4.2 `test_report_scenarios` 表

status 枚举新增 `skipped` 值，用于标记无脚本的用例。

### 4.3 不新增表

不创建"虚拟计划"表，不在 `plan_cases` 中插入记录。批量执行直接将 case_ids 传给执行引擎。

## 五、API 设计

### 5.1 批量执行（新增）

```
POST /api/projects/{project_id}/reports/execute-adhoc
Body: {
  case_ids: string[],      // 选中的用例 ID
  branch_id: string,       // 分支 ID
  type: "api" | "ui",      // 执行类型
  env_id: string,          // 环境 ID
  title?: string           // 可选报告标题
}
Response: {
  data: {
    report_id: string,     // 生成的报告 ID
    total: number,         // 总用例数
    executable: number,    // 可执行数
    skipped: number        // 跳过数（无脚本）
  }
}
```

后端处理：
1. 预检 case_ids，过滤出有对应类型脚本的用例
2. 创建 `test_reports` 记录（plan_id=NULL, source='adhoc'）
3. 无脚本用例创建 scenario 记录（status='skipped'）
4. 调用共享执行引擎（复用 Epic 4 的 worktree 沙箱逻辑）
5. 返回 report_id，前端跳转报告详情页

### 5.2 调试执行（保持现有）

```
POST /api/projects/{pid}/branches/{bid}/cases/{cid}/scripts/run?type=api|ui
Body: { envId: string }
```

不改动，不写入报告。

### 5.3 报告查询（现有接口兼容）

```
GET /api/plans/{plan_id}/report          -- 计划报告（不变）
GET /api/reports/{report_id}             -- 通用报告（新增，adhoc 报告走这个）
GET /api/projects/{pid}/reports          -- 报告列表（新增 source 筛选）
```

## 六、执行引擎重构

### 6.1 核心方法抽取

将 `plans/{id}/execute` 的核心逻辑抽成共享方法：

```python
async def run_execution(
    session, case_ids, env_id, test_type,
    plan_id=None, source="plan", title=None
) -> report_id:
```

- 计划执行：解析 plan_cases → 调用 run_execution(plan_id=plan_id)
- 批量执行：直接传 case_ids → 调用 run_execution(plan_id=None, source="adhoc")

### 6.2 沙箱策略

- 批量执行与计划执行共享同一个执行队列和并发控制
- 同一批次共享一个 worktree，API 类型顺序执行
- 失败不阻断（尽力而为），全部跑完再汇总
- Flaky 用例自动重试 1 次，报告标注"经重试通过"

## 七、前端改动清单

| 页面 | 改动 |
|------|------|
| CaseManagement.jsx | 批量操作栏增加「批量执行」按钮 + 弹窗（类型/环境/预检） |
| CaseDetail.jsx | 删除顶栏通用"执行"按钮；各 Tab 内增加运行按钮+环境选择 |
| ReportList.jsx | 支持 source 筛选（全部/计划/批量执行） |
| ReportDetail.jsx | 兼容 adhoc 报告（无 plan 信息时的展示） |

## 八、不做的事

- 不为批量执行创建"虚拟计划"表
- 不在调试模式写入报告
- 不在调试结果中混入执行历史 Tab
- 不为批量执行单独实现一套报告展示组件
- 第一版不做并行执行（顺序执行已满足需求，后续可优化）
