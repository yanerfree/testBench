---
name: tb-doc-generate
description: 根据测试用例自动生成操作手册、验收文档或培训教材
version: 1
tools:
  - tb_list_cases
  - tb_get_case
  - tb_list_api_tree
---

# 文档生成 Skill

## Step 1 — 收集用例内容

1. 调用 `tb_list_cases` 获取选中的用例
2. 调用 `tb_list_api_tree` 获取关联的 API 接口信息
3. 整理用例步骤、前置条件、预期结果

## Step 2 — 生成文档

根据文档类型生成 Markdown 内容：

### 操作手册（manual）
- 标题 + 概述
- 每个用例转为一个操作章节
- 步骤编号 + 操作描述 + 预期结果
- 注意事项和常见问题

### 验收文档（acceptance）
- 验收标准列表
- 每条标准对应的用例和验证方法
- 通过/不通过判定标准

### 培训教材（training）
- 学习目标
- 分章节的操作教程
- 练习题和自检清单

## Step 3 — 输出文档

输出完整的 Markdown 文档内容。
