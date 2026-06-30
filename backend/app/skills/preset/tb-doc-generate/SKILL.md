---
name: tb-doc-generate
description: 自动操作任意 Web 系统截图 + AI 生成带截图的操作文档
version: 3
inputs:
  - system_url: 被测系统地址（必填）
  - username: 登录账号（必填）
  - password: 登录密码（必填）
  - title: 文档标题（必填）
  - doc_type: 文档类型（manual/demo/acceptance）
  - modules: 文档范围（可选，逗号分隔）
  - audience: 目标读者（可选）
  - output_dir: 输出目录（Claude Code 模式）
  - business_context: 业务背景（可选）
---

# 文档生成 Skill (v4)

通用 Web 系统文档生成器，不依赖特定 UI 框架。

## Step 1 — 启动浏览器并登录

1. 启动 Chromium 无头浏览器（1400x900）
2. 打开 `system_url`，截图登录页
3. 通用登录：
   - 按优先级查找用户名输入框：`id*=user` → `name*=user` → `placeholder*=用户` → `type=text`
   - 查找密码框：`type=password`
   - 查找提交按钮：`type=submit` → `text=登录/Login/Sign in`
4. 等待登录完成，截图首页

## Step 2 — 发现导航并截图

1. 通用导航发现（按优先级）：
   - 语义化：`nav a` / `aside a`
   - ARIA：`[role="menuitem"]`
   - 常见框架：`.ant-menu-item` / `.el-menu-item`
   - 通用：`[class*="sidebar"] a` / `[class*="nav"] a`
2. 如果指定了 `modules`：
   - 匹配的菜单标记为 `isTarget=true`
   - 目标模块做**深度截图**
3. 逐个点击菜单项截图
4. 最多 20 张截图

## Step 3 — 深度截图（目标模块）

对 `isTarget` 模块执行：
1. **限定搜索范围**：只在主内容区域找按钮，排除侧边栏/导航
   - 优先选择器：`main button` → `[class*="content"] button` → `[class*="main"] button`
   - 兜底：全页面 `button`
2. **关键词匹配**：新增/创建/添加/新建/Add/Create/New
3. **过滤无关按钮**：
   - 检查按钮可见性（`is_visible()`）
   - 排除按钮文字包含其他模块关键词（AI/Mock/MCP/LLM 等），除非目标模块本身是这些
   - 跳过已点击过的同名按钮
4. 点击按钮，等待 1.5 秒
5. 检测弹窗/对话框/抽屉：
   - 通用选择器：`[role="dialog"]` / `[class*="modal"]` / `[class*="drawer"]` / `[class*="dialog"]`
6. 截图弹窗状态
7. 关闭弹窗：
   - 找关闭按钮：`[class*="close"]` / `text=取消/Cancel/关闭/Close`
   - 兜底：按 Escape
6. 每个目标模块最多深度截 3 张

## Step 4 — AI 写文档

1. 从本 SKILL.md 读取对应文档类型的格式模板
2. 组装 AI prompt：
   - 系统 prompt：格式模板 + 约束规则
   - 用户 prompt：标题/范围/读者/业务背景 + 截图列表（⭐标记目标）
3. 约束规则：
   - 只详细写 `modules` 范围内的功能
   - ⭐目标模块截图展开详细操作步骤
   - **必须引用每一张截图**，不遗漏
   - 其他截图作为辅助说明配图
   - 操作步骤具体到按钮名称、输入内容、预期结果

## Step 5 — 保存文档

1. **截图质量检查**：跳过空名称/None 的截图
2. **平台模式**：保存到 documents 表 + screenshots 目录
3. **Claude Code 模式**：保存到 output_dir
4. **导出支持**：HTML（图片 base64 内嵌）/ ZIP（md + images/）/ 复制 Markdown

## 格式模板

### 文档类型格式

#### 演示文档（demo）
```markdown
# 标题 — 简短描述

演示什么功能，完成什么工作流。
涉及模块：模块A、模块B
__演示耗时__：约 N 分钟

## 场景概述
功能做什么，为什么有用。

## 前置条件
使用什么角色登录
> **操作提示：** 名称均为示例值...

## 操作步骤
### 步骤一：动作名称
1. 具体操作
    - 预期：提示「xxx成功」
![](images/截图.png)
截图说明

__演示话术__：一句话总结。
```

#### 操作手册（manual）
```markdown
# 产品名称操作手册-模块篇

**公司名称**
**日期**

---

# 1. 简介
## 1.1 模块概述
模块做什么，核心能力。
## 1.2 功能介绍
- **功能A：** 一句话说明
## 1.3 术语定义
| 术语 | 解释 |
|---|---|
| 术语A | 解释 |

---

# 2. 操作指南
## 2.1 登录与权限说明
**登录操作：** 访问平台，输入用户名密码
**权限要求：** 需要什么权限
## 2.2 功能A
### 2.2.1 子功能
**适用场景：** 什么时候用
**前置条件：** 需要什么前提
**操作步骤：**
1. 进入【菜单名】页面
2. 点击"按钮名"
3. 预期：提示"成功"
![](images/image_001.png)
*图：截图说明*
```

#### 验收文档（acceptance）
```markdown
# 项目名称 验收文档

## 验收标准
| # | 验收项 | 验证方法 | 预期结果 | 通过标准 |
|---|--------|---------|---------|---------|
| 1 | 功能A | 操作步骤 | 成功 | 正常响应 |

## 详细验证步骤
### 验收项 1：功能A
1. 操作步骤
![](images/截图.png)
结果：✅ 通过
```

## 适配说明

本 Skill 通过通用选择器适配任意 Web 系统：
- 不依赖特定 UI 框架（Ant Design / Element UI / Material 等）
- 导航发现按优先级尝试多种选择器
- 登录检测支持中英文按钮文字
- 弹窗检测基于通用 CSS 类名和 ARIA role
- 如果某个系统的导航结构特殊，可以在 business_context 中补充说明
