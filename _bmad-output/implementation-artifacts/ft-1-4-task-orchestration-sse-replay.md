# Story ft-1-4: 任务编排底座 + SSE 回放

**Epic**: E1 基础设施与任务底座　**FR**: FR34/35(骨架)/36/63　**ADR**: ADR-1/ADR-3　**NFR**: NFR4/13/17
**状态**: review（自测通过，待 code review）
**日期**: 2026-07-09

## 交付内容

| 文件 | 变更 |
|------|------|
| `backend/app/services/scenario_gen/pipeline.py` | 新建：任务状态机（8 态+白名单流转）、可靠性四件套（_BG_TASKS 强引用/看门狗/启动孤儿扫描/runner 注册表）、emit_event/last_seq 事件流水、任务级信号量 |
| `backend/app/api/scenario_gen.py` | 新建：POST/GET tasks、任务快照（含 last_seq）、abort、SSE 事件流（afterSeq 回放→追平转实时→终态收口，独立短会话轮询不占连接池） |
| `backend/app/main.py` | 注册 scenario_gen 路由 + lifespan 启动 maintenance（孤儿扫描一次 + 常驻看门狗） |
| `tests/api/scenario_gen/`（2 文件 8 用例） | 生命周期（创建/校验/列表/快照/中止/404/二次中止 409）+ SSE（全量回放/断点续传/**追平后实时推送**） |
| `tests/integration/scenario_gen/`（1 文件 5 用例） | 状态机合法链/非法拒绝 + 孤儿扫描 + 看门狗超时/未超时 |
| `tests/conftest.py` | 附带修复：db_session 先导入 app.main 保证 metadata 完整（tests/api/cases 33 errors → 33 passed，对照验证净收益） |

## 验收标准核验

- [x] 状态机按 ADR-1 流转，非法流转抛 InvalidTransition（API 层转 409）
- [x] 强引用集合 + 看门狗（updated_at 超 30min 标 failed 原因可读）+ 启动孤儿扫描（活动态无 runner → failed「可从断点继续」）——集成测试 5/5
- [x] GET tasks/{id} 全量快照含 last_seq；events?afterSeq=N 先回放后实时；payload 精简（大对象只放 ID 的约定写入代码注释）
- [x] 任务级信号量（MAX_PARALLEL_TASKS=3，runner 挂接时消费）；历史任务列表分页/状态筛选（FR36）
- [x] 重启恢复：recover_orphans 集成测试模拟 fresh-process 语义（真实 kill 演练待 S2.3 runner 挂接后一并做端到端）
- [x] SSE 延迟：0.5s 轮询；实时推送测试中事件 0.7s 内到达（NFR4 <2s 达标）
- [x] 真实环境 smoke：开发实例重启加载新代码，healthz/readyz 全绿（db/redis/disk ok），新路由 401 认证生效，Mock 服务恢复正常

## 测试结果

- 新增 14 用例全过（8 API + 5 集成 + 1 实时推送）
- 全量回归 `tests/api + tests/integration`：198 passed / 4 failed——其中 2 个（variables 的 delete_channel/delete_variable）经 conftest 对照证实为既有失败；另 2 个为全量运行时的测试间污染（隔离运行即过，既有隔离问题）。**本次改动回归差值 0**

## 实现要点与决策

- SSE 用「DB 轮询 + 独立短会话」而非进程内 pubsub：天然兼容多 worker 部署，会话不长期占池；0.5s 轮询在 NFR4（<2s）内余量充足
- 查询参数遵循平台惯例 camelCase alias（afterSeq/pageSize）——初版漏了，被 SSE 断点续传测试抓出
- abort 后 `session.refresh(task)`：onupdate 的 updated_at 由 DB 生成，不取回会在序列化时触发 MissingGreenlet（被测试抓出）
- create_task 暂不挂提取 runner（S2.3 职责）：任务停在 extracting 由看门狗/孤儿扫描兜底，行为正确

## 已知事项（移交）

- 全量测试运行存在 2 个顺序依赖的既有 flake（plans/reports 相关，隔离即过）——建议后续排查 fixture 数据隔离
- lifespan 的 maintenance 任务在 ASGITransport 测试模式下不启动（无 lifespan），由真实环境 smoke 覆盖

## 下一个 Story

ft-1-2（阈值配置读取链）→ ft-1-3（llm_structured 封装）——为 S2.x 提取链路铺路；或 ft-1-5（前端骨架）并行。
