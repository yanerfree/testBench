---
name: tb-case-generate
description: 基于 API 接口定义和业务规则，多维度生成测试用例
version: 1
tools:
  - tb_list_cases
  - tb_get_folder_tree
  - tb_list_api_tree
  - tb_get_api_node
  - tb_create_case
---

# 用例生成 Skill

## Step 1 — 上下文收集

收集目标接口信息和已有用例：
1. 调用 `tb_list_api_tree` 获取项目的 API 接口列表
2. 调用 `tb_get_api_node` 获取目标接口的详细定义（method, url, headers, body, response）
3. 调用 `tb_list_cases` 查询同模块已有用例（避免重复生成）
4. 调用 `tb_get_folder_tree` 了解用例目录结构

## Step 2 — 维度规划

根据收集到的接口信息，规划 6-10 个测试维度：
- CRUD 正向路径（正常创建/查询/更新/删除）
- 参数验证（必填/格式/长度/类型/枚举）
- 业务规则（唯一性/权限/状态机/关联约束）
- 边界值（最小/最大/空/超长/特殊字符）
- 异常场景（网络错误/并发/数据不一致/服务不可用）
- 安全（注入/越权/敏感数据泄露）

输出规划好的维度列表和每个维度预计生成的用例数。

## Step 3 — 逐维度生成

按维度依次生成用例，每个维度生成 2-4 条：
- 每条用例包含：title, type, priority, preconditions, steps, expected_result, module, tags
- 步骤必须是具体操作（发送请求/点击/填写），不是笼统描述
- 每条用例一个验证点，不混合多个场景
- P0 不超过总数 15%
- 和已有用例去重（标题或场景重复的跳过）

## Step 4 — 反思补充

检查已生成的用例是否遗漏：
- 并发场景覆盖了吗？
- 跨功能交互测试了吗？
- 状态转换路径完整吗？
- 数据清理/回滚场景有吗？
如有遗漏，补充 1-3 条。

## Step 5 — 确认入库

将生成的用例批量创建到系统中，调用 `tb_create_case`。
输出最终统计：生成 N 条（P0: x, P1: y, P2: z），跳过 M 条重复。

## 质量红线

- 步骤必须是具体可执行的操作，不允许"验证功能正常"这类笼统描述
- 每条用例只验证一个点
- 数据用 ${变量名} 引用环境变量（如 ${BASE_URL}, ${AUTH_TOKEN}）
- P0 不超过总数 15%
- 不生成和已有用例重复的内容
