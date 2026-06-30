# 认证与授权测试模式（Auth Patterns）

## 认证（Authentication）

| 场景 | 请求 | 预期 |
|------|------|------|
| 无 Authorization header | 正常请求但不带 token | 401 Unauthorized |
| token 格式错误 | `Authorization: InvalidToken` | 401 |
| token 已过期 | 使用过期的 JWT | 401，body 中包含过期提示 |
| token 签名篡改 | 修改 JWT payload 后不重签 | 401 |
| token 为空串 | `Authorization: ` | 401 |
| 使用其他系统的 token | 合法 JWT 但 issuer 不匹配 | 401 |

## 授权（Authorization）

| 场景 | 预期 |
|------|------|
| 普通用户调用管理员接口 | 403 Forbidden |
| 用户 A 操作用户 B 的资源 | 403 或 404（取决于是否应暴露资源存在） |
| 项目成员操作非本项目资源 | 403 |
| 已禁用用户的 token | 401 或 403 |
| 越权修改只读字段 | 字段被忽略或返回 400 |

## 认证流程

| 场景 | 预期 |
|------|------|
| 正确用户名密码登录 | 200 + JWT token |
| 错误密码 | 401，不应泄露"用户名正确但密码错误" |
| 不存在的用户名 | 401，提示信息与错误密码一致 |
| 密码为空 | 400 或 401 |
| 登录后 token 刷新 | 旧 token 仍可用（或不可用，视策略） |
| 连续登录失败 N 次 | 账号锁定或延迟响应（如有） |
