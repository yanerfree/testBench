# Story 2.3: 用例导入（tea-cases.json）

Status: ready-for-dev

## Story

As a 测试人员,
I want 上传 tea-cases.json 文件将 TEA 生成的用例导入到当前分支配置,
so that 我不需要手动逐条录入。

## 任务拆解

### Task 1: ORM 模型 — CaseFolder + Case + Alembic 迁移
### Task 2: Schema — 导入响应
### Task 3: 导入服务层 — import_service.py
### Task 4: API 端点 + 注册 + 测试

## Dev Notes

### 导入逻辑
1. 解析 JSON → 校验 cases 数组
2. 遍历每条 case：
   - 自动创建 module/submodule 对应的 case_folder
   - 按 tea_id 查已有用例：不存在→新增，存在→更新，JSON 中消失→标记 script_removed
   - 生成 case_code: `TC-{MODULE}-{seq5}`
3. 返回摘要：new/updated/removed/skipped
