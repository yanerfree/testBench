# Story 1.6: RBAC 权限体系全局强制

Status: ready-for-dev

## Story

As a 平台用户,
I want 所有 API 和页面操作都受到基于角色的权限控制,
so that 不同角色只能执行其被授权的操作，数据安全有保障。

## 验收标准 (Acceptance Criteria)

### AC-1: require_project_role 依赖
**Given** 两级角色体系已实现
**When** 新增需要项目上下文的 API 端点
**Then** 开发者添加 `Depends(require_project_role("tester"))` 即可启用项目级权限检查

### AC-2: admin 绕过
**Given** 系统管理员调用任何项目 API
**When** 不论是否绑定该项目
**Then** 正常通过，不受项目级角色限制

### AC-3: 未绑定用户拒绝
**Given** 普通用户未绑定到某项目
**When** 调用该项目的 API
**Then** 返回 403

### AC-4: 角色层级
**Given** 用户绑定到项目
**When** 调用需要特定角色的 API
**Then**
- project_admin 可执行所有项目级操作
- developer/tester 可操作用例、执行等，不可改项目配置
- guest 仅查看，写操作返回 403

### AC-5: 改造现有成员管理端点
**Given** Story 1.5 的成员管理端点当前只允许系统 admin
**When** 实现项目级权限后
**Then** project_admin 也能管理所属项目的成员

## 任务拆解

### Task 1: 实现 require_project_role 依赖 (AC: #1, #2, #3, #4)
- [ ] 在 `deps/auth.py` 中新增 `require_project_role(*roles)` 依赖工厂
  - 从路径参数提取 `project_id`
  - 系统 admin → 直接通过
  - 非 admin → 查 project_members 获取项目角色 → 角色不在允许列表 → 403
  - 未绑定 → 403

### Task 2: 改造成员管理端点权限 (AC: #5)
- [ ] 将成员管理的 4 个端点从 `require_role("admin")` 改为 `require_project_role("project_admin")`
- [ ] 项目 CRUD（创建/删除）仍保持 `require_role("admin")`

### Task 3: 全量回归 + 新测试

## Dev Notes

### 权限矩阵

| 操作 | 系统 admin | project_admin | developer/tester | guest |
|------|-----------|---------------|-----------------|-------|
| 项目 CRUD | ✅ | ❌ | ❌ | ❌ |
| 成员管理 | ✅ | ✅ | ❌ | ❌ |
| 用例/执行（后续 Epic） | ✅ | ✅ | ✅ | ❌ |
| 查看 | ✅ | ✅ | ✅ | ✅ |

### require_project_role 设计

```python
def require_project_role(*roles: str) -> Callable:
    async def _check(
        project_id: uuid.UUID,  # 从路径参数自动注入
        current_user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_db),
    ) -> User:
        if current_user.role == "admin":
            return current_user  # 系统 admin 绕过
        # 查 project_members
        member = ...
        if member is None or member.role not in roles:
            raise ForbiddenError(...)
        return current_user
    return _check
```
