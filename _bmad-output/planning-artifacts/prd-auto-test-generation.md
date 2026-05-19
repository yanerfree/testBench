# 需求文档：AI 驱动的测试脚本自动生成

> 版本：v1.0 · 日期：2026-05-19 · 优先级：紧急

---

## 1. 背景

testBench 是一个测试管理平台，目前已具备用例管理、执行计划、报告生成等能力。但测试脚本（API 自动化脚本、UI E2E 脚本）仍然需要人工编写，存在以下痛点：

| 痛点 | 现状 | 期望 |
|------|------|------|
| 脚本编写慢 | 一个模块的 API 测试脚本需要 1-2 天 | AI 分钟级生成，人工审核修改 |
| 覆盖不全 | 人工容易遗漏异常路径（权限、校验、边界） | AI 按规则自动推导正向+异常场景 |
| 格式不统一 | 不同人写的脚本风格不同 | 所有脚本严格遵循 project-context.md 规范 |
| 新页面无脚本 | 新开发的页面没有 UI 回归测试 | AI 探索页面后自动生成可执行的 E2E 脚本 |

---

## 2. 目标

通过 BMAD Skill 实现两种 AI 驱动的测试脚本自动生成能力：

### 2.1 核心目标

1. **API 接口自动化脚本生成** — 扫描后端路由代码，自动推导测试场景，生成 pytest 脚本
2. **UI 测试脚本生成** — 通过 Playwright 探索页面，识别交互元素，生成可重复执行的 E2E 脚本
3. **与平台无缝衔接** — 生成的脚本自动更新 `tea-cases.json`，可直接导入 testBench 平台执行

### 2.2 非目标（本期不做）

- 不做脚本的自动修复/自愈（脚本失败后自动调整定位器等）
- 不做持续监控（只是一次性生成，不是持续运行）
- 不做平台 UI 入口（本期通过 Claude Code Skill 触发，不在前端做按钮）

---

## 3. 用户角色

| 角色 | 使用场景 |
|------|---------|
| **测试工程师** | 为新模块快速生成 API 测试基线，再手动补充边界场景 |
| **开发工程师** | 为自己写的 API 生成测试，作为自测手段 |
| **QA 负责人** | 批量为多个模块生成测试，快速提升覆盖率 |

---

## 4. 功能需求

### FR-1：API 接口自动化脚本生成

**触发方式**：`/generate-api-tests {模块名}` 或 `/generate-api-tests all`

#### FR-1.1 端点扫描

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.1.1 | 扫描指定模块的后端路由文件 `backend/app/api/{module}.py` | 能正确识别所有 `@router.{method}` 装饰器 |
| FR-1.1.2 | 提取端点的 HTTP 方法、路径、路径参数、请求体 Schema、响应状态码、权限依赖 | 输出完整的端点清单 |
| FR-1.1.3 | 支持 `all` 参数扫描所有模块 | 遍历 `backend/app/api/` 下所有路由文件 |

#### FR-1.2 场景推导

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.2.1 | 每个端点至少生成 1 个正向场景 | POST→创建成功，GET→列表返回，PUT→更新成功，DELETE→删除成功 |
| FR-1.2.2 | 有权限依赖的端点生成权限测试（401/403） | 无 token 返回 401，低权限返回 403 |
| FR-1.2.3 | 有请求体的端点生成输入校验测试（422） | 缺必填字段返回 422 |
| FR-1.2.4 | 有路径参数的端点生成 404 测试 | 不存在的 ID 返回 404 |
| FR-1.2.5 | 自动分配优先级 P0/P1/P2 | 正向场景 P0，权限/校验 P1，分页/空列表 P2 |

#### FR-1.3 增量生成

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.3.1 | 检查 `tests/api/{module}/` 下已有测试文件 | 已存在的场景不重复生成 |
| FR-1.3.2 | 支持 `full` 模式覆盖已有脚本 | 用户可选择全量重新生成 |

#### FR-1.4 脚本输出

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.4.1 | 脚本遵循 `project-context.md` 定义的格式 | 文件名、class 名、目录结构全部符合规范 |
| FR-1.4.2 | 使用现有 conftest.py 中的 fixtures | 正确引用 `create_test_user`、`make_auth_headers` 等 |
| FR-1.4.3 | 请求体使用 camelCase | 与 API 实际接收格式一致 |
| FR-1.4.4 | 每个文件包含 docstring（场景描述 + Test ID + Priority） | 可被 tea-cases.json 解析 |

#### FR-1.5 索引同步

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.5.1 | 新生成的用例自动追加到 `tea-cases.json` | tea_id、title、module、script_ref 齐全 |
| FR-1.5.2 | 已存在相同 tea_id 的记录更新而非重复添加 | 幂等性 |
| FR-1.5.3 | 自动生成的用例带有 `auto-generated` tag | 可区分人工用例和自动生成用例 |

#### FR-1.6 验证与报告

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-1.6.1 | 生成后运行 `pytest --collect-only` 验证语法 | 无语法错误 |
| FR-1.6.2 | 输出生成摘要（端点数、场景数、覆盖情况） | 用户可直观看到生成了什么 |

---

### FR-2：UI 测试脚本生成

**触发方式**：`/generate-ui-tests {页面URL} {模块名}`

#### FR-2.1 页面探索

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-2.1.1 | 自动登录（从 .env 读取凭据） | 成功进入已认证状态 |
| FR-2.1.2 | 导航到目标页面并获取 snapshot | 识别页面结构 |
| FR-2.1.3 | 识别页面元素：表单、按钮、表格、搜索框、分页、弹窗 | 输出元素分类清单 |

#### FR-2.2 交互分析

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-2.2.1 | 对表单执行空提交，记录校验提示 | 识别必填字段 |
| FR-2.2.2 | 对表单填写有效数据后提交，记录结果 | 识别成功/失败行为 |
| FR-2.2.3 | 对列表执行搜索、分页操作，记录变化 | 识别列表交互模式 |
| FR-2.2.4 | 对删除按钮点击，记录确认弹窗 | 识别危险操作的确认机制 |

#### FR-2.3 场景推导

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-2.3.1 | 根据识别的元素类型推导测试场景 | 表单→提交/校验，列表→搜索/分页，删除→确认 |
| FR-2.3.2 | 每个页面至少生成：加载、核心操作、校验 3 类场景 | 最低覆盖保证 |
| FR-2.3.3 | 支持有文档模式（对照文档验证）和无文档模式（纯探索） | 两种模式均可工作 |

#### FR-2.4 脚本输出

| 需求 | 说明 | 验收标准 |
|------|------|---------|
| FR-2.4.1 | 生成标准 Playwright pytest 脚本 | 使用 `playwright.async_api` |
| FR-2.4.2 | 定位器优先使用 Role/Label/Text，避免 CSS/XPath | 脚本可维护性高 |
| FR-2.4.3 | 包含登录和导航的 helper 方法 | `_login()` + `_navigate()` |
| FR-2.4.4 | 断言使用 `expect` API | `await expect(xxx).to_be_visible()` |
| FR-2.4.5 | 脚本放置在 `tests/e2e/{module}/` 目录 | 符合 project-context.md 规范 |

#### FR-2.5 索引同步与报告

与 FR-1.5、FR-1.6 相同规则，level 为 `e2e`。

---

## 5. 非功能需求

| 编号 | 需求 | 指标 |
|------|------|------|
| NFR-1 | 单模块生成速度 | API 测试 < 3 分钟，UI 测试 < 5 分钟 |
| NFR-2 | 脚本通过率 | 生成的脚本 `pytest --collect-only` 100% 通过（语法层面） |
| NFR-3 | 可读性 | 生成的脚本遵循 Given/When/Then 注释，变量名有意义 |
| NFR-4 | 增量安全 | 增量模式不会覆盖已有的人工修改过的脚本 |
| NFR-5 | 规范一致性 | 100% 遵循 project-context.md 中的格式和目录规范 |

---

## 6. 交互设计

### 6.1 API 测试生成流程

```
用户输入: /generate-api-tests auth

→ [扫描中] 正在扫描 backend/app/api/auth.py ...
→ [发现] 4 个端点: POST /login, GET /me, POST /change-password, POST /logout
→ [推导] 12 个测试场景（4 P0 + 5 P1 + 3 P2）
→ [增量] 已有 8 个脚本，跳过；新增 4 个
→ [生成] 
   ✓ tests/api/auth/test_change_password_success.py
   ✓ tests/api/auth/test_change_password_wrong_old.py
   ✓ tests/api/auth/test_change_password_unauthorized.py
   ✓ tests/api/auth/test_logout_success.py
→ [验证] pytest --collect-only 通过
→ [索引] tea-cases.json +4 条记录
→ 完成！生成 4 个新脚本，总覆盖 12/12 场景
```

### 6.2 UI 测试生成流程

```
用户输入: /generate-ui-tests http://localhost:5173/projects projects

→ [登录] 使用 .env 凭据登录成功
→ [导航] 已打开项目管理页面
→ [识别] 页面元素: 1 个搜索框, 1 个新建按钮, 1 个项目表格(5列), 分页
→ [探索] 执行交互分析...
   - 新建按钮 → 弹窗(3个字段: 名称/Git URL/脚本路径)
   - 搜索框 → 实时过滤
   - 表格行 → 编辑/删除操作
→ [推导] 7 个测试场景（2 P0 + 3 P1 + 2 P2）
→ [生成]
   ✓ tests/e2e/projects/test_projects_page_loads.py
   ✓ tests/e2e/projects/test_create_project_success.py
   ✓ tests/e2e/projects/test_create_project_validation.py
   ✓ tests/e2e/projects/test_search_projects.py
   ✓ tests/e2e/projects/test_edit_project.py
   ✓ tests/e2e/projects/test_delete_project_confirm.py
   ✓ tests/e2e/projects/test_projects_pagination.py
→ [索引] tea-cases.json +7 条记录
→ 完成！
```

---

## 7. 与现有系统的关系

```
                    testBench 平台
                         │
                    tea-cases.json ←──── 自动更新
                         │
              ┌──────────┼──────────┐
              │          │          │
         tests/api/  tests/e2e/ tests/unit/
              ▲          ▲
              │          │
    ┌─────────┴──┐  ┌───┴──────────┐
    │ generate-  │  │ generate-    │  ← 本次新增
    │ api-tests  │  │ ui-tests     │
    └────────────┘  └──────────────┘

    ┌────────────┐  ┌──────────────┐
    │ explore-   │  │ bmad-qa-     │  ← 已有（互补关系）
    │ test       │  │ generate-e2e │
    │ (出报告)    │  │ (通用，不针对  │
    │            │  │  testBench)  │
    └────────────┘  └──────────────┘
```

| 对比 | 新 Skill | 已有 Skill |
|------|---------|-----------|
| 目标 | 生成可执行脚本文件 | explore-test 出报告 / bmad-qa 通用模板 |
| 规范 | 严格遵循 project-context.md | 通用格式 |
| 索引 | 自动更新 tea-cases.json | 不更新 |
| 适用 | testBench 项目专用 | 通用项目 |

---

## 8. 里程碑

| 阶段 | 内容 | 状态 |
|------|------|------|
| M1：设计规范 | 产出格式规范、探索策略、同步规则 | ✅ 完成 |
| M2：Skill 定义 | 创建 generate-api-tests 和 generate-ui-tests 两个 Skill | ✅ 完成 |
| M3：实际验证 | 选一个模块（如 auth）实际运行 Skill，验证生成效果 | ⬜ 待做 |
| M4：迭代优化 | 根据验证结果调整场景推导规则和脚本模板 | ⬜ 待做 |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 生成的脚本运行时可能失败 | 脚本语法对但运行时数据依赖不满足 | 验证阶段先 collect-only，后续补充运行时验证 |
| UI 探索可能遗漏元素 | 动态加载/异步渲染的元素未被识别 | 探索时增加 wait_for_load_state，多次 snapshot |
| tea-cases.json 冲突 | 多人同时生成导致 JSON 合并冲突 | 增量模式 + 基于 tea_id 的幂等更新 |
| 脚本可维护性 | AI 生成的定位器可能不够稳定 | 优先使用 Role/Label 定位，禁止 XPath |
