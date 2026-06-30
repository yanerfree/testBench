---
name: tb-doc-generate
description: 自动操作被测系统截图 + AI 生成带截图的操作文档
version: 2
tools:
  - playwright_screenshot
  - ai_write_document
inputs:
  - system_url: 被测系统地址（必填）
  - username: 登录账号（必填）
  - password: 登录密码（必填）
  - title: 文档标题（必填）
  - doc_type: 文档类型（manual/acceptance/training）
  - modules: 文档范围（可选，指定截哪些模块）
  - audience: 目标读者（可选）
  - output_dir: 输出目录（Claude Code 模式用）
  - business_context: 业务背景（可选）
---

# 文档生成 Skill

## 概述

自动操作被测系统并截图，AI 根据截图和页面信息生成带截图的操作文档。
支持两种执行方式：
- **平台直接执行**：后端 Playwright 无头浏览器截图 → AI 写文档 → 保存到平台
- **Claude Code 执行**：读取任务配置 → 打开浏览器 → 截图 → 写文档 → 保存到本地目录

## Step 1 — 启动浏览器并登录

1. 启动 Playwright Chromium 无头浏览器（viewport: 1400x900）
2. 打开 `system_url`
3. 截图：登录页面 → `01_login.png`
4. 找到用户名输入框，填入 `username`
5. 找到密码输入框，填入 `password`
6. 点击登录按钮
7. 等待页面加载完成
8. 截图：登录后首页 → `02_after_login.png`

## Step 2 — 进入目标项目

1. 如果当前页面是项目列表，点击第一个项目卡片进入
2. 截图：项目首页 → `03_project_home.png`

## Step 3 — 逐菜单截图

1. 获取左侧导航菜单所有菜单项
2. 跳过"返回项目列表"等导航类菜单
3. 如果指定了 `modules`，只截匹配的菜单；否则截所有
4. 逐个点击菜单项：
   - 点击 → 等待 2 秒页面加载
   - 截图 → `{序号}_{菜单名}.png`
   - 记录页面 URL
5. 最多截 15 张截图

## Step 4 — AI 写文档

1. 将所有截图信息（页面名称、截图路径、页面 URL）组装成上下文
2. 根据文档类型选择对应的输出格式模板
3. 调用 LLM 生成文档

### 文档类型格式模板

#### 演示文档（demo）
```markdown
# 标题 — 简短描述

演示什么功能，完成什么工作流。

涉及模块：模块A、模块B

__演示耗时__：约 N 分钟

## 场景概述
功能做什么，为什么有用。

## 前置条件
使用什么角色登录，需要什么前提
> **操作提示：** 名称等均为示例值...

## 操作步骤

### 步骤一：动作名称
1. 具体操作
2. 点击【按钮名称】
    - 预期：提示「xxx成功」

![](images/截图.png)
截图说明

__演示话术__：一句话总结。
```

#### 操作手册（manual）
```markdown
# 系统名称 操作手册

## 文档信息
| 项目 | 内容 |
|------|------|
| 版本 | 1.0 |
| 适用范围 | 模块A、模块B |

## 目录
1. [功能A](#功能a)
2. [功能B](#功能b)

## 功能A
### 功能说明
功能做什么。
### 操作步骤
1. 步骤一
![](images/截图.png)
### 预期结果
成功后看到什么。
### 常见问题
Q: 问题？A: 解答。
```

#### 验收文档（acceptance）
```markdown
# 项目名称 验收文档

## 验收标准
| # | 验收项 | 验证方法 | 预期结果 | 通过标准 |
|---|--------|---------|---------|---------|
| 1 | 功能A | 操作步骤 | 成功 | 响应正常 |

## 详细验证步骤
### 验收项 1：功能A
1. 操作步骤
![](images/截图.png)
结果：✅ 通过
```
4. 输出完整 Markdown

## Step 5 — 保存文档

### 平台模式
- 文档内容保存到 `documents` 表
- 截图保存到 `data/screenshots/{project_id}/{session_id}/`
- 状态设为 `published`

### Claude Code 模式
- 文档保存到 `{output_dir}/{title}.md`
- 截图保存到 `{output_dir}/images/`

## 导出格式

- **HTML 导出**：截图转 base64 内嵌，单文件离线可查看
- **ZIP 打包**：Markdown 文件 + images/ 目录
- **复制 Markdown**：粘贴到 Confluence/飞书等

## 质量要求

- 每个章节必须引用对应的截图
- 操作步骤要具体到按钮名称、输入内容
- 不允许编造系统中不存在的功能
- 文档结构：标题 → 目录 → 各功能章节 → 常见问题

## 对应代码

- 后端执行器：`backend/app/services/doc_generator.py`
- API 端点：`POST /api/projects/{id}/documents/generate-with-screenshots`
- 前端入口：项目菜单「文档管理」→ 生成按钮 → 平台直接生成
