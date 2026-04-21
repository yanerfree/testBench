# tea-cases.json 规范

> 此文件是测试平台"同步用例"功能的数据源。每次测试脚本更新后，TEA 负责人需同步更新此文件。

## 文件位置

```
项目仓库根目录/tea-cases.json
```

同步时系统会读取 `{script_base_path}/{branch_name}/tea-cases.json`。

## 完整字段说明

```jsonc
{
  "version": "1.0",
  "project": "项目名称",
  "cases": [
    {
      // ── 必填字段 ──────────────────────────────────────
      "tea_id": "auth_login_success",       // 唯一标识，不可重复，建议用 模块_子模块_函数名
      "title": "正确凭据登录返回 JWT token",  // 用例标题
      "type": "api",                         // 测试类型：api | e2e
      "module": "auth",                      // 一级模块（对应目录树第一级）

      // ── 推荐字段 ──────────────────────────────────────
      "submodule": "login",                  // 二级模块（对应目录树第二级）
      "priority": "P0",                      // 优先级：P0 | P1 | P2 | P3，默认 P2
      "preconditions": "1. 系统已有活跃用户 admin\n2. 密码为 admin123",  // 前置条件
      "steps": [                             // 测试步骤（数组）
        { "seq": 1, "action": "POST /api/auth/login，body: {username: admin, password: admin123}" },
        { "seq": 2, "action": "检查响应 status=200，body 包含 token 字段" }
      ],
      "expected_result": "返回 200 + JWT token，token 可解码且包含 sub 和 role",  // 预期结果
      "script_ref": {                        // 脚本引用
        "file": "tests/api/auth/test_login_success.py",  // 脚本文件路径（相对于仓库根）
        "func": "test_correct_credentials_return_token",  // 测试函数名（不含类名）
        "class": "TestLoginSuccess"                       // 测试类名（函数定义在 class 内时必填）
      },
      "tags": ["security", "smoke"]          // 标签（可选，导入后存为备注）
    }
  ]
}
```

## 字段详细规则

| 字段 | 必填 | 类型 | 说明 |
|------|:----:|------|------|
| `tea_id` | ✅ | string | 全局唯一标识，建议格式：`{module}_{submodule}_{func_name}` |
| `title` | ✅ | string | 用例标题，≤200 字符 |
| `type` | ✅ | string | `api` 或 `e2e` |
| `module` | ✅ | string | 一级模块名（如 auth、users、plans） |
| `submodule` | | string | 二级模块名（如 login、jwt、crud） |
| `priority` | | string | `P0`（冒烟）/ `P1`（核心）/ `P2`（普通）/ `P3`（低优先级），默认 P2 |
| `preconditions` | | string | 前置条件，多条用换行分隔 |
| `steps` | | array | 测试步骤，每项 `{ "seq": N, "action": "描述" }` |
| `expected_result` | | string | 预期结果 |
| `script_ref` | | object | 脚本引用：`file`（文件路径）、`func`（函数名）、`class`（类名，函数在 class 内时**必填**） |
| `tags` | | array | 标签列表，导入后存为用例备注 |

### script_ref 拼接规则

系统执行用例时，通过 `script_ref` 构建 pytest 命令：

- **无 class**：`pytest {file}::{func}` — 适用于模块级函数
- **有 class**：`pytest {file}::{class}::{func}` — 适用于定义在类中的方法

**重要**：如果测试函数定义在 class 内但未填写 `class` 字段，pytest 将无法找到该用例，执行报 `no match` 错误。

```jsonc
// ✅ 正确：函数在 class 内，填写了 class
"script_ref": { "file": "tests/e2e/test_smoke.py", "func": "test_full_auth_lifecycle", "class": "TestE2EAuthLifecycle" }
// → pytest tests/e2e/test_smoke.py::TestE2EAuthLifecycle::test_full_auth_lifecycle

// ✅ 正确：函数在模块级，不需要 class
"script_ref": { "file": "tests/api/test_login.py", "func": "test_login_success" }
// → pytest tests/api/test_login.py::test_login_success

// ❌ 错误：函数在 class 内但未填 class
"script_ref": { "file": "tests/e2e/test_smoke.py", "func": "test_full_auth_lifecycle" }
// → pytest tests/e2e/test_smoke.py::test_full_auth_lifecycle → no match!
```

## 同步规则

点击"同步用例"时，系统执行以下操作：

1. **Git pull** — 拉取最新代码到服务器
2. **读取 tea-cases.json** — 解析用例列表
3. **按 `tea_id` 匹配**：
   - JSON 中有、DB 中没有 → **新增**用例
   - JSON 中有、DB 中也有 → **更新**元数据（title、priority、steps 等）
   - DB 中有、JSON 中没有 → 标记为 `script_removed`（脚本已移除）
4. **自动创建目录** — 根据 module/submodule 自动创建目录树

## 维护要求

- **每次新增测试脚本**时，在 `cases` 数组中追加对应条目
- **每次删除测试脚本**时，从 `cases` 数组中移除对应条目（同步后会自动标记 removed）
- **修改测试逻辑**时，更新对应条目的 `steps`、`expected_result`、`preconditions`
- `tea_id` 一旦确定**不要修改**（修改等同于删旧建新）

## 示例：一条完整用例

```json
{
  "tea_id": "api_users_test_create_user",
  "title": "创建用户 — 管理员可成功创建新用户",
  "type": "api",
  "module": "api",
  "submodule": "users",
  "priority": "P0",
  "preconditions": "1. 以 admin 身份登录\n2. 系统中不存在同名用户",
  "steps": [
    { "seq": 1, "action": "POST /api/users，body: {username: testuser, password: Test@123, role: tester}" },
    { "seq": 2, "action": "检查响应 status=201" },
    { "seq": 3, "action": "GET /api/users?keyword=testuser 确认用户存在" }
  ],
  "expected_result": "用户创建成功，列表中可查到该用户",
  "script_ref": {
    "file": "tests/api/users/test_create_user.py",
    "func": "test_admin_can_create_user",
    "class": "TestCreateUser"
  },
  "tags": ["crud", "smoke"]
}
```
