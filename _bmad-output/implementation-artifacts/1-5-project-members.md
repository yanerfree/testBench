# Story 1.5: 项目成员管理

Status: ready-for-dev

## Story

As a 系统管理员,
I want 将用户绑定到项目并指定项目级角色（project_admin/developer/tester/guest），
so that 成员可以按权限访问和操作项目数据。

## 验收标准 (Acceptance Criteria)

### AC-1: 查看项目成员
**Given** admin 已登录
**When** 访问项目成员列表
**Then** `GET /api/projects/{id}/members` 返回该项目所有成员及其角色

### AC-2: 添加成员
**Given** admin 已登录
**When** 选择用户并指定项目角色
**Then**
- `POST /api/projects/{id}/members` 绑定成功
- 同一用户不可重复绑定（唯一约束 → 409）
- 绑定后该用户立即可在项目列表看到该项目

### AC-3: 修改成员角色
**Given** admin 修改某成员的项目角色
**When** 选择新角色后保存
**Then** `PUT /api/projects/{id}/members/{userId}` 变更立即生效

### AC-4: 移除成员
**Given** admin 移除某成员
**When** 确认操作
**Then** `DELETE /api/projects/{id}/members/{userId}` 执行成功

### AC-5: 不能移除最后一个 project_admin
**Given** 项目只剩一个 project_admin
**When** 尝试移除或将其改为其他角色
**Then** 返回 422 错误

### AC-6: 权限拦截
**Given** 非 admin 用户
**When** 尝试添加/修改/移除成员
**Then** 返回 403（注：项目级 project_admin 权限在 Story 1.6 实现）

## 任务拆解

### Task 1: Schema — member 请求/响应
- [ ] 在 `schemas/project.py` 中新增 `AddMemberRequest`、`UpdateMemberRequest`、`MemberResponse`

### Task 2: 服务层 — member_service.py
- [ ] 新建 `services/member_service.py`：list_members、add_member、update_member_role、remove_member
- [ ] 移除最后一个 project_admin 时抛 422

### Task 3: API 路由 — 挂到 projects router
- [ ] 在 `api/projects.py` 中新增 4 个成员端点

### Task 4: 冒烟验证 + 全量回归

## Dev Notes

### 关键约束
1. **project_members 表已存在**（Story 1.4 创建），直接使用
2. **角色枚举**：project_admin / developer / tester / guest — 用 Literal 校验
3. **最后一个 admin 保护**：移除或降级 project_admin 前，查询同项目 project_admin 数量，若 <= 1 则 422
4. **权限控制**：当前用 `require_role("admin")`，Story 1.6 再扩展为项目级检查
5. **MemberResponse** 需要包含用户信息（username 等），用 JOIN 查询

### 已有基础设施
- `models/project.py` — ProjectMember 模型
- `deps/auth.py` — `require_role("admin")`
- `core/exceptions.py` — 需要新增或复用一个 422 错误类
