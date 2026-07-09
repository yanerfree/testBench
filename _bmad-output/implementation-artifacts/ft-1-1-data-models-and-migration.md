# Story ft-1-1: 数据模型与迁移

**Epic**: E1 基础设施与任务底座　**FR**: FR11/17/57 底座　**ADR**: ADR-2
**状态**: review（自测通过，待 code review）
**日期**: 2026-07-08

## 交付内容

| 文件 | 变更 |
|------|------|
| `backend/app/models/scenario_gen.py` | 新建：RequirementDoc / GenerationTask / RequirementPoint / ScenarioModel / GenerationItem / CaseGenEvent / TaskEvent 七个模型 |
| `backend/app/models/case.py` | Case 扩展 6 列（review_status / review_reason / quality_score / generation_task_id / requirement_point_ids / version）+ 底部依赖导入 |
| `backend/alembic/env.py` | 注册 scenario_gen 模型（metadata 发现） |
| `backend/alembic/versions/a3f7c1d95e2b_scenario_gen_tables.py` | 迁移：7 表 + 6 列 + GIN 索引，含完整 downgrade |

## 验收标准核验

- [x] 7 张新表按 ADR-2 字段清单建模，generation_items 有 UNIQUE(task_id, test_point_ref)
- [x] Case 新列兼容旧数据（review_status 等 nullable；version 带 server_default=1 回填）——实测 1494 条既有用例：review_status 全 NULL、version 全为 1
- [x] requirement_point_ids 建 GIN 索引（ix_cases_requirement_point_ids，实测存在）；case_gen_events / task_events 仅插入无更新路径（模型无 onupdate）
- [x] 迁移可回滚——真实库执行 upgrade → downgrade → re-upgrade 三步循环通过，head=a3f7c1d95e2b
- [x] 既有流程回归（NFR15 范围内）：tests/api/cases 目录改动前后错误集合完全一致（33 个既有错误，见下方"已知问题"），回归差值 0

## 实现要点

- TaskEvent 用 BigInteger 自增主键即 SSE 回放 seq（ADR-3），索引 (task_id, id)
- GenerationItem 带 point_snapshot 冗余测试点快照——模型后续被编辑不影响已生成 item 的追溯
- dedup_case_id 独立于 case_id：skipped（去重）时指向已有用例，succeeded 时 case_id 指向新用例
- case.py 底部 `from app.models import scenario_gen`：Case 的 FK 指向 generation_tasks，必须保证任何导入 Case 的 create_all 场景 metadata 完整（测试中实际抓到过 NoReferencedTableError，已修复并验证）

## 已知问题（超出本 Story 范围，移交）

- **tests/api/cases 本地 ASGI 模式先天失败（33 例）**：conftest 的 db_session fixture 在 app.main 导入前 create_all，metadata 不完整导致 "relation projects does not exist"。平台模式（BASE_URL）不受影响。与本次改动无关（对照实验证实）。建议后续独立修复 conftest（在 create_all 前导入 app.main 或全量模型）。→ 已记入 Sprint 1 待办备注

## 下一个 Story

ft-1-4（任务编排底座 + SSE 回放）——按就绪检查建议，最大技术风险先行；或按依赖顺序 ft-1-2（阈值配置链）。
