# 自动生成测试脚本 — 设计规范

> 版本：v1.0 · 日期：2026-05-19

---

## 1. 背景与目标

testBench 平台管理测试用例和执行，但**测试脚本的编写**仍依赖人工。本需求引入两种 AI 驱动的脚本生成能力：

| 能力 | 触发方式 | 产出 |
|------|---------|------|
| **API 接口自动化脚本生成** | 指定模块或全量扫描 | `tests/api/{module}/test_{slug}.py` |
| **UI 测试脚本生成** | 指定页面 URL 探索 | `tests/e2e/{module}/test_{slug}.py` |

两者均遵循 `project-context.md` 定义的目录结构、命名规范和 `tea-cases.json` 格式，生成的脚本可直接被平台导入执行。

---

## 2. 总体架构

```
用户调用 Skill
       │
       ▼
┌──────────────────────────────────────────────────────┐
│                    探索阶段                            │
│  API: 扫描后端路由文件 → 提取端点清单 → 分析请求/响应模型  │
│  UI:  playwright-cli 打开页面 → 识别元素/表单/交互       │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│                  用例设计阶段                          │
│  根据端点/页面元素自动推导测试场景                        │
│  每个场景分配: tea_id / title / module / priority       │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│                  脚本生成阶段                          │
│  按 project-context.md 规范生成 .py 脚本文件            │
│  同步更新 tea-cases.json 索引                          │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────┐
│                  验证阶段                              │
│  运行 pytest 验证脚本语法正确（dry-run）                 │
│  输出生成报告摘要                                      │
└──────────────────────────────────────────────────────┘
```

---

## 3. 生成脚本格式规范

### 3.1 API 测试脚本模板

```python
"""
test_{slug} — {场景中文描述}
Test ID: {module}-API-{seq}
Priority: {P0/P1/P2}
"""
import pytest

from tests.conftest import create_test_user, make_auth_headers, login_as


class Test{PascalCaseScenario}:
    """{端点描述}: {HTTP_METHOD} {path}"""

    async def _setup(self, client, db_session):
        """创建测试所需的前置数据"""
        admin = await create_test_user(db_session, username="{module}_admin", role="admin")
        headers, _ = make_auth_headers(admin)
        # ... 创建所需的项目/分支/用例等前置数据
        return headers, ...

    @pytest.mark.asyncio
    async def test_{happy_path_slug}(self, client, db_session):
        # Given: {前置条件描述}
        headers, *ctx = await self._setup(client, db_session)

        # When: {操作描述}
        response = await client.{method}("{path}", headers=headers, json={...})

        # Then: {预期结果描述}
        assert response.status_code == {expected_status}
        data = response.json()["data"]
        assert data["{key}"] == {expected_value}

    @pytest.mark.asyncio
    async def test_{error_case_slug}(self, client, db_session):
        # Given: {错误条件描述}
        headers, *ctx = await self._setup(client, db_session)

        # When: {触发错误的操作}
        response = await client.{method}("{path}", headers=headers, json={...})

        # Then: {错误预期}
        assert response.status_code == {error_status}
```

### 3.2 UI 测试脚本模板

```python
"""
test_{slug} — {UI 场景中文描述}
Test ID: {module}-E2E-{seq}
Priority: {P0/P1/P2}
"""
import pytest
from playwright.async_api import Page, expect


class Test{PascalCaseScenario}:
    """{页面名}: {用户操作流程}"""

    @pytest.mark.asyncio
    async def test_{interaction_slug}(self, page: Page):
        # Given: 用户已登录并进入{页面名}
        await page.goto("{page_url}")

        # When: {用户操作描述}
        await page.get_by_role("button", name="{按钮名}").click()
        await page.get_by_label("{字段名}").fill("{输入值}")

        # Then: {预期 UI 变化}
        await expect(page.get_by_text("{预期文本}")).to_be_visible()
```

### 3.3 通用编写规则

| 规则 | 说明 |
|------|------|
| 一文件一场景 | 每个 `test_{slug}.py` 对应一个测试场景 |
| class 内可多方法 | 同一场景的正向/反向用例放在同一 class |
| 异步 async def | 所有测试方法用 `async def`，搭配 `@pytest.mark.asyncio` |
| Given/When/Then | 关键步骤用注释标明意图 |
| 不硬编码数据 | 使用 `factories.py` 或 `_setup()` 方法创建数据 |
| camelCase JSON | 请求体字段用 camelCase（与 API 一致） |

---

## 4. 探索策略

### 4.1 API 探索策略

**输入**：指定模块名（如 `auth`）或 `all` 全量扫描

**探索流程**：

```
Step 1: 读取后端路由文件
   → backend/app/api/{module}.py
   → 提取所有 @router.get/post/put/delete 装饰器

Step 2: 解析端点信息
   → HTTP 方法 + 路径 + 路径参数
   → 请求体 Schema（从 Pydantic model 提取字段）
   → 响应 Schema + 状态码
   → 权限要求（require_role / require_project_role）

Step 3: 推导测试场景
   每个端点至少生成:
   ├── 正向场景: 正常请求返回预期结果
   ├── 权限场景: 无 token / 低权限 → 401/403
   └── 输入校验: 缺必填字段 / 非法值 → 422/400

Step 4: 检查已有脚本
   → 读取 tests/api/{module}/ 下的现有文件
   → 跳过已覆盖的场景，只生成增量
```

**场景推导规则**：

| 端点类型 | 自动生成的场景 | 优先级 |
|---------|--------------|--------|
| POST（创建） | 创建成功 / 缺必填字段 / 重复创建 / 无权限 | P0 |
| GET（列表） | 列表返回 / 分页 / 筛选 / 空列表 / 无权限 | P0 |
| GET（详情） | 获取成功 / 不存在 404 / 无权限 | P1 |
| PUT（更新） | 更新成功 / 不存在 / 无权限 / 非法字段 | P1 |
| DELETE（删除） | 删除成功 / 不存在 / 无权限 / 有依赖不可删 | P1 |
| POST（动作） | 动作成功 / 前置状态不满足 / 无权限 | P0 |

### 4.2 UI 探索策略

**输入**：目标页面 URL + 可选的文档路径

**探索流程**：

```
Step 1: 登录并导航到目标页面
   → 从 .env 读取凭据
   → playwright-cli 打开浏览器，登录，导航

Step 2: 页面元素识别
   → snapshot 获取页面结构
   → 识别: 表单/按钮/表格/搜索框/分页/弹窗/标签页

Step 3: 交互探索
   → 对每个可交互元素执行操作
   → 记录操作 + 页面变化 + 网络请求

Step 4: 推导测试场景
   每个页面至少生成:
   ├── 页面加载: 核心元素可见
   ├── 表单操作: 新建/编辑/提交/校验
   ├── 列表操作: 搜索/筛选/分页/排序
   ├── 删除操作: 删除确认/取消
   └── 导航: 跳转/返回/面包屑
```

**场景推导规则**：

| 页面元素 | 自动生成的场景 | 优先级 |
|---------|--------------|--------|
| 表单 | 填写提交成功 / 空提交校验 / 边界值 | P0 |
| 列表/表格 | 加载显示 / 搜索过滤 / 分页切换 | P0 |
| 按钮（操作） | 点击后状态变化 / 确认弹窗 | P1 |
| 导航/路由 | 页面跳转 / 面包屑 | P2 |
| 空状态 | 无数据时的占位提示 | P2 |

---

## 5. tea-cases.json 同步规则

生成脚本时必须同步更新 `tea-cases.json`：

```json
{
  "tea_id": "{module}_{slug}",
  "title": "{场景中文标题}",
  "module": "{module}",
  "submodule": "{submodule_or_null}",
  "type": "api",
  "level": "api",
  "priority": "P0",
  "script_ref": {
    "file": "tests/api/{module}/test_{slug}.py",
    "class": "Test{PascalCase}",
    "func": "test_{func_name}"
  },
  "tags": ["auto-generated"]
}
```

**同步策略**：
- 新生成的用例 → 追加到 `cases` 数组
- 已存在相同 `tea_id` → 更新 `script_ref` 和 `title`
- 脚本文件被删除 → 从 `cases` 中移除对应记录
- 重新生成时 → 增量模式，不覆盖已有用例
- 所有自动生成的用例添加 `"auto-generated"` tag

---

## 6. 两个 Skill 定义

### 6.1 generate-api-tests

| 属性 | 值 |
|------|---|
| **触发语** | "生成 API 测试" / "generate api tests for {module}" |
| **输入** | 模块名（如 `auth`, `users`）或 `all` |
| **产出** | `tests/api/{module}/test_*.py` + `tea-cases.json` 更新 |
| **工具** | Read, Write, Bash, Glob |

### 6.2 generate-ui-tests

| 属性 | 值 |
|------|---|
| **触发语** | "生成 UI 测试" / "generate ui tests for {page}" |
| **输入** | 页面 URL + 可选文档路径 |
| **产出** | `tests/e2e/{module}/test_*.py` + `tea-cases.json` 更新 |
| **工具** | Read, Write, Bash(playwright-cli:*), Glob |

---

## 7. 优先级与场景覆盖度

### 7.1 优先级分配策略

| 优先级 | 场景类型 | 占比目标 |
|--------|---------|---------|
| P0 | 核心路径：登录、CRUD 正向、关键业务流程 | ~30% |
| P1 | 异常路径：权限、输入校验、边界条件 | ~40% |
| P2 | 补充路径：空状态、分页、排序、UI 细节 | ~25% |
| P3 | 低频路径：罕见组合、兼容性 | ~5% |

### 7.2 每模块最低覆盖

| 模块端点数 | 最少生成脚本数 |
|-----------|--------------|
| 1-3 个端点 | 每端点 2-3 个场景 |
| 4-6 个端点 | 每端点 1-2 个场景 + 1 个跨端点 E2E |
| 7+ 个端点 | 核心端点各 2 个 + 其余各 1 个 + 2 个 E2E |

---

## 8. 与现有体系的关系

```
project-context.md          ← 脚本格式与目录规范（强制遵循）
     │
     ├── generate-api-tests  ← 新 Skill：读代码 → 生成 API 脚本
     ├── generate-ui-tests   ← 新 Skill：探索页面 → 生成 UI 脚本
     │
     ├── explore-test        ← 已有：一次性页面探索测试（出报告不出脚本）
     ├── bmad-testarch-automate ← 已有：TEA 覆盖扩展（更重量级）
     └── bmad-qa-generate-e2e-tests ← 已有：通用 E2E 生成（不针对 testBench）
```

新 skill 与现有 skill 的区别：
- **generate-api-tests** 专注于 API 脚本，基于路由代码静态分析，不需要运行服务
- **generate-ui-tests** 专注于 UI 脚本，基于 playwright-cli 实际探索，需要运行服务
- 两者都严格遵循 `project-context.md` 的 testBench 特有规范
- 两者都自动更新 `tea-cases.json`，与平台无缝衔接
