---
name: tb-api-case-generate
description: 根据 API 接口定义自动生成接口测试场景（含请求步骤和断言）
version: 1
inputs:
  - api_ids: 要测试的 API 接口 ID 列表（必填）
  - branch_id: 分支 ID（必填）
  - env_variables: 环境变量（可选，如 BASE_URL, AUTH_TOKEN）
---

# 接口测试用例生成 Skill

根据 API 接口的参数定义（字段类型、必填、长度、枚举、正则等），自动生成结构化的测试场景。

## Step 1 — 读取接口定义

1. 调用 `tb_get_api_node` 获取每个接口的详细定义
2. 提取关键信息：method, url, params(含 type/required/pattern/enum/min/max), headers, body schema
3. 统计字段数量，决定场景拆分粒度

## Step 2 — 规划测试场景

根据接口复杂度决定拆分方式：

| 条件 | 拆分方式 |
|------|---------|
| 接口字段 ≤3 个 | 所有参数校验合成一个场景，场景名：`[接口名]-参数校验` |
| 接口字段 >3 个 | 按字段拆分，每个字段一个场景，场景名：`[接口名]-[字段名]校验` |
| 有 CRUD 组合（同模块 GET/POST/PUT/DELETE） | 额外生成一个 `[模块名]-CRUD完整流程` 场景 |
| 安全相关 | 额外生成一个 `[接口名]-安全测试` 场景 |

## Step 3 — 生成测试步骤

每个场景内按以下顺序生成步骤：

### 3.1 前置步骤
- 如果接口需要认证 → 先生成一个"登录-提取token"步骤
- 提取的 token 存为变量，后续步骤通过 `${token}` 引用

### 3.2 按字段约束生成验证步骤

对每个字段，根据其 schema 约束生成对应的请求：

| 字段约束 | 生成的步骤 | 断言 |
|---------|----------|------|
| required: true | `[接口名]-[字段]为空` | status == 400, message 包含字段名 |
| type: string 但传 number | `[接口名]-[字段]类型错误` | status == 400 |
| minLength: N | `[接口名]-[字段]长度=N`（正向）+ `[接口名]-[字段]长度N-1`（反向） | 正向 2xx, 反向 400 |
| maxLength: M | `[接口名]-[字段]长度=M`（正向）+ `[接口名]-[字段]长度M+1`（反向） | 正向 2xx, 反向 400 |
| enum: [A, B, C] | `[接口名]-[字段]=A`（正向）+ `[接口名]-[字段]=无效值`（反向） | 正向 2xx, 反向 400 |
| pattern: regex | `[接口名]-[字段]格式正确`（正向）+ `[接口名]-[字段]格式错误`（反向） | 正向 2xx, 反向 400 |

### 3.3 正向基准步骤
- 所有字段传合法值 → 期望成功
- 步骤名：`[接口名]-正常请求`

### 3.4 安全步骤（如有安全场景）
- SQL 注入：string 字段传 `' OR 1=1 --`
- XSS：string 字段传 `<script>alert(1)</script>`
- 步骤名：`[接口名]-SQL注入防护`、`[接口名]-XSS防护`

### 3.5 清理步骤
- 如果正向步骤创建了资源 → 最后加一个 DELETE 步骤清理

## Step 4 — 输出格式

输出 JSON，每个场景包含步骤数组：

```json
{
  "scenarios": [
    {
      "title": "创建用户接口-用户名长度校验",
      "priority": "P0",
      "description": "用户名支持3-100位字符，包含数字、字母和特殊字符@.-_",
      "steps": [
        {
          "name": "登录-提取token",
          "method": "POST",
          "url": "${BASE_URL}/api/auth/login",
          "headers": {"Content-Type": "application/json"},
          "body": {"username": "${ADMIN_USER}", "password": "${ADMIN_PASS}"},
          "assertions": [
            {"type": "status", "operator": "==", "value": 200},
            {"type": "body_field", "field": "data.token", "operator": "not_empty"}
          ],
          "variables_extract": {"token": "data.token"}
        },
        {
          "name": "添加用户-用户名长度2(低于最小值)",
          "method": "POST",
          "url": "${BASE_URL}/api/users",
          "headers": {"Authorization": "Bearer ${token}"},
          "body": {"username": "ab", "password": "Test123456"},
          "assertions": [
            {"type": "status", "operator": "==", "value": 400},
            {"type": "body_contains", "field": "message", "value": "用户名"}
          ]
        },
        {
          "name": "添加用户-用户名长度=3(最小值)",
          "method": "POST",
          "url": "${BASE_URL}/api/users",
          "headers": {"Authorization": "Bearer ${token}"},
          "body": {"username": "abc", "password": "Test123456"},
          "assertions": [
            {"type": "status", "operator": "==", "value": 201}
          ],
          "variables_extract": {"created_user_id": "data.id"}
        },
        {
          "group": "用户名长度3-100",
          "name": "添加用户-用户名长度50(中间值)",
          "method": "POST",
          "url": "${BASE_URL}/api/users",
          "body": {"username": "a]50[", "password": "Test123456"},
          "assertions": [{"type": "status", "operator": "==", "value": 201}]
        },
        {
          "name": "删除测试用户",
          "method": "DELETE",
          "url": "${BASE_URL}/api/users/${created_user_id}",
          "headers": {"Authorization": "Bearer ${token}"},
          "assertions": [{"type": "status", "operator": "in", "value": [200, 204]}]
        }
      ]
    }
  ]
}
```

## Step 5 — 入库

将场景和步骤存入 `api_test_scenarios` 和 `api_test_steps` 表。

## 质量红线

- **命名**：场景名必须标注接口名+测试维度；步骤名必须标注操作+具体场景
- **断言**：每个请求必须有至少一个断言，包含具体的 HTTP 状态码
- **数据**：请求参数必须是具体值，不能写"无效值"、"合法数据"等笼统描述
- **变量**：公共参数用 `${ENV_VAR}` 引用，步骤间传递用 `variables_extract`
- **覆盖**：每个 required 字段至少 1 条缺失用例；每个有约束的字段至少正向+反向各 1 条
- **清理**：如果步骤创建了资源，最后必须有清理步骤

## 断言类型

| type | 说明 | 示例 |
|------|------|------|
| status | HTTP 状态码 | `{"type":"status", "operator":"==", "value":200}` |
| body_field | 响应字段值 | `{"type":"body_field", "field":"data.id", "operator":"not_empty"}` |
| body_contains | 响应包含文本 | `{"type":"body_contains", "field":"message", "value":"用户名"}` |
| body_type | 响应字段类型 | `{"type":"body_type", "field":"data", "operator":"is_array"}` |
| header | 响应头 | `{"type":"header", "field":"Content-Type", "operator":"contains", "value":"json"}` |
