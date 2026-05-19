---
name: generate-api-tests
description: '扫描后端 API 路由，自动生成接口自动化测试脚本。Use when user says "生成 API 测试" or "generate api tests for [module]"'
allowed-tools: Read Write Bash Glob
---

# API 接口自动化脚本生成

扫描后端路由代码，分析端点、请求模型和权限，自动推导测试场景并生成符合 `project-context.md` 规范的 pytest 脚本。

## 输入参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `目标模块` | ✅ | 模块名（如 `auth`、`users`）或 `all` 全量扫描 |
| `覆盖模式` | 可选 | `increment`（默认，跳过已有脚本）或 `full`（全量生成） |
| `优先级范围` | 可选 | 只生成指定优先级及以上（默认 `P2`，即生成 P0/P1/P2） |

---

## 执行流程

```
Step 1 加载规范   → 读取 project-context.md + conftest.py
Step 2 扫描端点   → 解析路由文件提取端点清单
Step 3 分析模型   → 提取请求/响应 Schema 字段
Step 4 推导场景   → 按规则生成测试场景列表
Step 5 检查增量   → 跳过已覆盖的场景
Step 6 生成脚本   → 输出 test_*.py 文件
Step 7 更新索引   → 同步 tea-cases.json
Step 8 验证      → dry-run 检查语法
Step 9 报告      → 输出生成摘要
```

---

## Step 1：加载项目规范

用 `Read` 工具读取以下文件，提取编写规范：

1. **`project-context.md`** — 目录结构、命名规则、脚本模板
2. **`tests/conftest.py`** — 可用 fixtures（`client`, `db_session`, `create_test_user`, `make_auth_headers`, `login_as` 等）
3. **`tests/factories.py`** — 数据工厂函数（如存在）

将规范保存到工作记忆，后续步骤严格遵循。

---

## Step 2：扫描端点

根据目标模块，读取后端路由文件：

```
backend/app/api/{module}.py
```

如果目标是 `all`，读取 `backend/app/api/` 下所有 `.py` 文件（排除 `__init__.py`）。

**提取信息**：

对每个路由文件，识别所有 `@router.{method}` 装饰器，提取：

| 信息 | 来源 | 示例 |
|------|------|------|
| HTTP 方法 | 装饰器名称 | `POST` |
| 路径 | 装饰器第一参数 | `/api/projects/{project_id}/plans` |
| 路径参数 | 路径中的 `{xxx}` | `project_id`, `plan_id` |
| 请求体类型 | 函数参数的类型标注 | `CreatePlanRequest` |
| 响应状态码 | `status_code` 参数 | `201` |
| 权限依赖 | `Depends(require_role(...))` | `require_role("admin")` |
| 函数名 | def 后的名字 | `create_plan` |

输出端点清单，格式如下：

```
## {module} 模块端点清单

1. POST /api/projects/{pid}/plans → create_plan
   - 请求体: CreatePlanRequest
   - 权限: project_admin
   - 状态码: 201

2. GET /api/projects/{pid}/plans → list_plans
   - 查询参数: page, pageSize, status
   - 权限: project member
   - 状态码: 200
```

---

## Step 3：分析请求/响应模型

找到 Step 2 中识别的 Schema 类，读取其定义：

```
backend/app/schemas/{module}.py  或  backend/app/schemas/
```

提取每个字段的：
- 名称 + 类型
- 是否必填（有无默认值）
- 校验规则（min_length, max_length, regex, Literal 枚举值等）
- 嵌套结构

---

## Step 4：推导测试场景

对每个端点，按以下规则自动推导测试场景：

### 4.1 正向场景（每端点必生成）

| 端点类型 | 场景 | slug 模式 | 优先级 |
|---------|------|----------|--------|
| POST 创建 | 创建成功 | `create_{resource}_success` | P0 |
| GET 列表 | 列表返回 | `list_{resources}` | P0 |
| GET 详情 | 获取成功 | `get_{resource}_detail` | P1 |
| PUT 更新 | 更新成功 | `update_{resource}_success` | P1 |
| DELETE 删除 | 删除成功 | `delete_{resource}_success` | P1 |
| POST 动作 | 动作成功 | `{action}_{resource}_success` | P0 |

### 4.2 异常场景（按端点类型生成）

| 条件 | 场景 | slug 模式 | 优先级 |
|------|------|----------|--------|
| 有权限依赖 | 无 token 访问 → 401 | `{action}_{resource}_unauthorized` | P1 |
| 有权限依赖 | 低权限访问 → 403 | `{action}_{resource}_forbidden` | P1 |
| 有路径参数 | 不存在的 ID → 404 | `{action}_{resource}_not_found` | P1 |
| 有请求体 | 缺必填字段 → 422 | `create_{resource}_missing_fields` | P1 |
| 有唯一约束 | 重复创建 → 409 | `create_{resource}_duplicate` | P1 |
| 有 Literal 枚举 | 非法枚举值 → 422 | `create_{resource}_invalid_type` | P2 |
| GET 列表 | 空结果 | `list_{resources}_empty` | P2 |
| GET 列表有分页 | 分页参数 | `list_{resources}_pagination` | P2 |

### 4.3 场景命名规则

```
tea_id:  {module}_{slug}
title:   {中文描述}
file:    tests/api/{module}/test_{slug}.py
class:   Test{PascalCaseSlug}
func:    test_{slug} (正向) 或 test_{error_type} (异常)
```

---

## Step 5：检查增量

读取 `tests/api/{module}/` 目录下的已有测试文件。

对每个推导出的场景：
- 如果存在同名文件 `test_{slug}.py` → 标记为"已覆盖"，跳过
- 如果文件存在但只覆盖了正向场景，缺异常场景 → 标记为"可补充"
- 如果不存在 → 标记为"待生成"

在 `increment` 模式下只生成"待生成"的脚本。在 `full` 模式下生成所有。

---

## Step 6：生成脚本

按 project-context.md 中的模板格式，为每个待生成场景创建脚本文件。

### 6.1 脚本生成规则

1. **文件头**：包含 docstring（场景描述 + Test ID + Priority）
2. **导入**：只导入实际使用的 fixtures（从 conftest.py 中选取）
3. **class 结构**：一个文件一个 class，class 名 = `Test` + PascalCase(slug)
4. **_setup 方法**：如果需要前置数据（创建用户/项目/用例），抽取为 `_setup`
5. **测试方法**：
   - 用 `@pytest.mark.asyncio` 装饰
   - 参数固定为 `self, client, db_session`
   - Given/When/Then 注释
   - 请求体用 camelCase（与 API 保持一致）
6. **断言**：
   - 状态码断言 `assert response.status_code == xxx`
   - 响应结构断言 `assert "data" in response.json()`
   - 关键字段断言（至少验证 1-2 个业务字段）

### 6.2 前置数据处理

根据端点的路径参数层级，生成对应的 `_setup` 方法：

| 路径层级 | _setup 需要创建 |
|---------|---------------|
| `/api/users` | admin 用户 |
| `/api/projects/{pid}` | admin 用户 + 项目 |
| `/api/projects/{pid}/branches/{bid}` | admin 用户 + 项目 + 分支 |
| `/api/projects/{pid}/branches/{bid}/cases` | admin 用户 + 项目 + 分支 + 用例 |
| `/api/projects/{pid}/plans/{plan_id}` | admin 用户 + 项目 + 用例 + 计划 |

**参考现有测试中的 `_setup` 模式**，保持一致性。

### 6.3 输出路径

```
tests/api/{module}/test_{slug}.py
```

如果 `tests/api/{module}/` 目录不存在，先创建它和 `__init__.py`。

---

## Step 7：更新 tea-cases.json

读取现有的 `tea-cases.json`，对每个新生成的脚本：

1. 生成 `tea_id` = `{module}_{slug}`
2. 检查是否已存在相同 `tea_id`
   - 不存在 → 追加新记录
   - 已存在 → 更新 `script_ref` 字段
3. 更新 `summary` 统计数据
4. 设置 `generatedAt` 为当前时间
5. 每条记录添加 `"auto-generated"` tag

---

## Step 8：语法验证

运行 dry-run 验证脚本可被 pytest 发现：

```bash
python -m pytest tests/api/{module}/ --collect-only -q 2>&1 | tail -20
```

如果有语法错误，立即修复。

---

## Step 9：输出报告

在终端输出生成摘要，格式如下：

```
## API 测试脚本生成报告

### 扫描模块: {module}
- 发现端点: {n} 个
- 推导场景: {m} 个
- 已有覆盖: {k} 个（跳过）
- 新生成脚本: {j} 个
- 更新 tea-cases.json: +{j} 条记录

### 生成文件清单
| # | 文件 | 场景 | 优先级 |
|---|------|------|--------|
| 1 | tests/api/{module}/test_{slug1}.py | {title1} | P0 |
| 2 | tests/api/{module}/test_{slug2}.py | {title2} | P1 |

### 覆盖情况
- P0 场景: {a}/{b} 已覆盖
- P1 场景: {c}/{d} 已覆盖
- P2 场景: {e}/{f} 已覆盖
```

---

## 示例：为 auth 模块生成

输入：`生成 API 测试 auth`

扫描 `backend/app/api/auth.py`，发现 4 个端点：

| 端点 | 方法 |
|------|------|
| `/api/auth/login` | POST |
| `/api/auth/me` | GET |
| `/api/auth/change-password` | POST |
| `/api/auth/logout` | POST |

推导场景 → 检查已有 → 生成增量脚本 → 更新 tea-cases.json → 验证 → 报告。
