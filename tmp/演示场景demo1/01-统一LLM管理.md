# 统一 LLM 管理 — 厂商接入、消费方授权与调用验证

演示大模型厂商的统一接入管理，完成从添加厂商、创建消费方、授权到验证调用的完整闭环。

涉及模块：LLM 管理（厂商管理）、消费方管理

__演示耗时__：约 5 分钟

## 场景概述

AI 网关（LLM Gateway）支持 OpenAI、DeepSeek、Llama、OpenRouter、Qwen（通义千问）、Volcengine（火山引擎）等主流大模型提供商的统一代理接入，对外提供兼容 OpenAI API 协议的标准化调用接口，实现多模型统一管理和集中管控。

本场景演示如何将大模型厂商接入平台，创建消费方并授权，最终验证调用链路可用。

## 前置条件

使用系统管理员角色登录部署环境：c1 已就绪
业务数据：无（从零开始创建）


> **操作提示：** 文档中的项目名称、API 访问路径、消费方名称、MCP 服务名称等均为示例值。操作过程中如果保存/发布时提示"xxx名称已存在"或"xxx路径已存在"，说明当前环境中已有同名资源，请替换为任意当前系统中不存在的名称或路径即可，不影响后续操作流程。

## 操作步骤

### 步骤一：添加大模型厂商

1. 点击【LLM 管理】→【厂商管理】页面，点击【添加厂商】
2. 配置厂商类型（如 DeepSeek）、名称、API Key
3. 点击【确定】
	- 预期：提示「创建成功」，厂商卡片出现在列表中

![](https://empower.paraview.cn/api/open/file/get/v67d9f051ed142cf01b474d5edd105e233b2103ec2973dcac9d1701ade4fdca3d4)

添加LLM厂商

![](https://empower.paraview.cn/api/open/file/get/v6fdad8e1079c0903a2823155734b2799103b7ca0d815edcb194c47aee853fb8f8)

厂商列表

### 步骤二：创建消费方

1. 点击【门户管理】→【消费方管理】，然后点击【添加消费方】
2. 应用名称：LLM测试消费方，认证方式：Key\-Auth
3. 点击【确定】
	- 预期：创建成功，页面显示 AppId 和 ApiKey，记录备用

![](https://empower.paraview.cn/api/open/file/get/v60999554a1fb70248743ae63f5b33704978caae29a527e2043a4454a51ada061a)

创建消费方

![](https://empower.paraview.cn/api/open/file/get/v6a85a2dfbbb99dc8de0c6373b848ade3c0dc400c0bf11192bad25c213eeee5e22)

消费方列表

### 步骤三：配置路由策略

1. 【LLM 管理】切换到路由策略 Tab 页面
2. 点击【添加策略】，配置策略名称、路由模式（如 Single）、路由目标（选择刚添加的厂商和模型）
3. 点击【确定】
	- 预期：提示「创建成功」，策略列表中新增一条路由策略

![](https://empower.paraview.cn/api/open/file/get/v6ab1b922ffc91b2dea014409faa8aae171c22426f83143d7130b04aa777d9387d)

创建路由策略

![](https://empower.paraview.cn/api/open/file/get/v6f7749ecac9860911260591a49fa20c41815f79c7e151283c06353ed79c2ebf2e)

路由策略列表

### 步骤四：授权消费方

1. 在消费方列表找到「LLM测试消费方」，操作列点击【路由策略授权】
2. 选择部署环境 c1，选择要授权的路由策略，点击【确认授权】
	- 预期：提示「授权成功」

![](https://empower.paraview.cn/api/open/file/get/v68f71661fc2dbc75de236b573557c94a36160dc5b92463927fb7d4e3833038eeb)

![](https://empower.paraview.cn/api/open/file/get/v6b620e4181f4e1ad43250baaa258b1da9b6bd70841efd03cf601ea79af6063a39)

路由策略授权

3. 复制 LLM 访问地址，后续调用会使用到

### 步骤五：验证调用

终端执行：

curl \-X POST "http://<实际LLM访问地址>" \\
  \-H "Content\-Type: application/json" \\
  \-H "apikey: <实际ApiKey>" \\
  \-d '\{"model":"deepseek\-chat","messages":\[\{"role":"user","content":"你好"\}\],"stream":false\}'

预期：返回 HTTP 200，AI 模型正常回复

### 步骤六：查看 LLM 日志

1. 点击左侧菜单【日志管理】→【LLM日志】
2. 可按消费方、日志类型、流水号、响应码、请求/响应包含内容、时间范围等条件筛选
3. 列表展示每条调用记录：提供方、消费方、接口名称、流水号、服务耗时、响应码、请求时间、部署环境
4. 点击操作列的【查看详情】，可查看完整的请求和响应内容

![](https://empower.paraview.cn/api/open/file/get/v6f9c2c29baa5c4cc091e29804d3cf5a15f1e09d61e65a4c89cb609c39b83ebb9c)

LLM日志列表

__演示话术__：一个入口地址统一所有大模型调用，密钥集中管控不泄露，消费方按需授权，调用日志全程可审计。
