# Story 2.1: 分支配置 CRUD

Status: ready-for-dev

## Story

As a 项目管理员,
I want 在项目下创建、编辑、归档和恢复分支配置,
so that 我可以管理不同版本/分支的用例集和脚本目录。

## 验收标准 (Acceptance Criteria)

### AC-1: 创建分支配置
**Given** 项目管理员进入项目设置
**When** 创建新分支配置
**Then**
- `POST /api/projects/{id}/branches` 创建成功
- 名称在项目内唯一，重名返回 409
- 名称仅允许 `[a-zA-Z0-9_-]`，最长 50 字符（DB 层 CHECK 约束已有）
- Git 分支字段可选，默认 `main`

### AC-2: 编辑分支配置
**Given** 项目管理员编辑分支配置
**When** 修改 Git 分支名
**Then** `PUT /api/projects/{projectId}/branches/{branchId}` 更新成功（name 不可改）

### AC-3: 归档分支配置
**Given** 项目管理员归档某分支
**When** 点击归档
**Then** `POST /api/projects/{projectId}/branches/{branchId}/archive` → status 改为 archived

### AC-4: 不能归档最后一个活跃分支
**Given** 项目只剩一个活跃分支
**When** 尝试归档
**Then** 返回 422

### AC-5: 恢复已归档分支
**Given** 分支已归档
**When** 点击恢复
**Then** `POST /api/projects/{projectId}/branches/{branchId}/activate` → status 改为 active

### AC-6: 分支列表
**Given** 用户进入用例管理页
**When** 加载分支选择器
**Then** `GET /api/projects/{id}/branches` 返回所有分支，按状态分组

### AC-7: 权限
**Given** 非 project_admin/admin
**When** 尝试创建/编辑/归档/恢复分支
**Then** 返回 403（查看列表所有成员可）

## 任务拆解

### Task 1: Schema — branch 请求/响应
- [ ] 新建 `schemas/branch.py`：CreateBranchRequest / UpdateBranchRequest / BranchResponse

### Task 2: 服务层 — branch_service.py
- [ ] list / create / update / archive / activate，含最后活跃分支保护

### Task 3: API 路由 — 挂到 projects router 或独立 router
- [ ] GET/POST branches + PUT/archive/activate 单个分支

### Task 4: 全量回归 + 新测试

## Dev Notes

### 关键约束
1. **branches 表已存在**（Story 1.4 创建），直接使用
2. **name 不可修改** — UpdateBranchRequest 不含 name 字段
3. **最后活跃分支保护** — 归档前查 active 状态的 branch 数量
4. **创建项目时已自动建 default 分支** — Story 1.4 逻辑
5. **权限** — 创建/编辑/归档/恢复用 `require_project_role("project_admin")`，列表用 `require_project_role("project_admin", "developer", "tester", "guest")`
