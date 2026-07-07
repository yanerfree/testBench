---
status: complete
date: 2026-07-07
---

# Implementation Readiness Check — 接口测试模块

## 已有基础（可直接使用）

| 组件 | 状态 | 说明 |
|------|------|------|
| ApiTestScenario 模型 | ✅ 完整 | status/source/priority/env_variables/source_api_ids/folder_id 全部存在 |
| ApiTestStep 模型 | ✅ 完整 | enabled/assertions/variables_extract/pre_script/post_script/last_status/last_response/sort_order |
| ApiTestFolder 模型 | ✅ 完整 | name/parent_id/branch_id + UniqueConstraint |
| 后端 CRUD API | ✅ 12 端点 | 场景/步骤/文件夹 CRUD + AI 生成(SSE) + 单步执行 |
| AI 生成服务 | ✅ 可用 | api_test_generator.py，SSE 流式返回 |
| 单步执行 | ✅ 内联 | run-step 端点，变量替换 + 断言检查 |
| MCP 基础设施 | ✅ 10 工具 | 用例/API/环境/报告相关工具已注册 |

## 需要新增/修改

| 组件 | 状态 | Sprint | 说明 |
|------|------|--------|------|
| `edited_after_generate` 字段 | ❌ 缺失 | S5 | ApiTestScenario 需加字段 |
| 批量执行引擎 `api_test_runner.py` | ❌ 缺失 | S3 | 单步执行是内联的，需抽取为服务 + 批量场景执行 |
| 报告生成服务 `api_test_report.py` | ❌ 缺失 | S3 | 需新建 |
| 分支深拷贝 `branch_copy_service.py` | ❌ 缺失 | S5 | 需新建 |
| MCP 接口测试工具 `api_test_tools.py` | ❌ 缺失 | S4 | 需新建 |
| `TestReport.report_type` 字段 | ❌ 缺失 | S3 | 需加字段 |
| `TestReport.plan_id` 可空 | ❌ 非空 | S3 | 当前 nullable=False，需改为 True |
| MCP Mock 路由解耦 | ❌ 待做 | S1 | 当前共用 `/mcp/`，需拆分 |
| 前端组件拆分 | ❌ 711 行单文件 | S1 | 需拆为 7 个组件 |
| 全局分支选择器 | ❌ 缺失 | S5 | App.jsx 顶部栏无分支选择器 |
| 批量操作 API | ❌ 缺失 | S1 | 批量改状态/删除/移动 |
| 场景复制/拆分 API | ❌ 缺失 | S2 | copy/split 端点 |

## 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 前端 711 行拆分可能引入回归 | 中 | Sprint 1 首先拆分，逐步验证 |
| TestReport.plan_id 改可空影响已有报告 | 低 | migration 设默认值，已有数据不受影响 |
| MCP Mock 解耦可能影响已有 Mock 用户 | 低 | 前端地址引用同步更新即可 |
| 批量执行性能（100 步骤 < 3min） | 低 | AsyncClient 复用 + 信号量控制，ADR-2/6/7 已有方案 |

## 结论

**准备度：READY** — 核心模型和 CRUD 已就绪，缺失的组件按 Sprint 计划逐步构建即可。无阻断性依赖。
