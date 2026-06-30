---
version: 2.0
date: 2026-06-12
status: draft
inputDocuments: [reference screenshots from Aemeath LLM Mock, OpenAI API spec research]
---

# 产品需求文档（PRD）
# LLM Mock — AI 响应模拟服务

**版本：** 2.0
**日期：** 2026-06-12
**状态：** 草稿

---

## 一、产品概述

### 1.1 背景

在 AI 应用开发和测试过程中，直接调用真实 LLM API 存在以下问题：

- **成本高**：每次测试都消耗 token 费用，大规模回归测试成本不可控
- **不稳定**：真实 API 有限频、超时、服务不可用等情况，影响测试稳定性
- **无法模拟异常**：难以测试 429 限频、500 错误、context_length 超限等边界场景
- **响应不可控**：真实 LLM 响应内容不确定，无法做精确断言

需要一个 OpenAI 兼容的 Mock 服务，让开发和测试团队能够可控地模拟各种 LLM 响应场景。

### 1.2 目标

在测试管理平台中内置 LLM Mock 服务，提供：
- **零成本测试**：无需真实 API Key 即可测试 AI 功能
- **场景覆盖**：预设常见响应模式 + 自定义模式，覆盖正常和异常场景
- **请求可观测**：记录所有请求日志，支持回放和分析
- **开箱即用**：一键启停，兼容 OpenAI API 格式

### 1.3 范围

**本期实现：**
- Mock 路由管理（CRUD、启用/禁用）
- Mock 配置（延迟、状态码、响应体、Token、Model、Headers）
- 预设响应模式（正常/限频/错误/未授权/超限等）+ 自定义
- 请求日志（实时记录、筛选、详情查看、回放）
- Mock 服务启停控制
- OpenAI Chat Completions API 兼容（streaming + non-streaming）

**暂不实现：**
- Embeddings / Images / Audio 等其他 OpenAI API
- 多用户隔离（共享配置）
- Mock 配置导入/导出

---

## 二、功能详细设计

### 2.1 系统架构

LLM Mock 作为后端内置的独立 HTTP 服务运行，监听独立端口（默认 9100），通过管理 API 进行配置。

```
┌─────────────────────────────────────┐
│         测试管理平台前端              │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ 路由管理  │  │  请求日志面板     │ │
│  │ 配置面板  │  │  (实时 WebSocket) │ │
│  └──────────┘  └──────────────────┘ │
└──────────┬──────────────┬───────────┘
           │ 管理API       │ WS
┌──────────▼──────────────▼───────────┐
│         后端 (FastAPI)               │
│  ┌──────────────────────────────┐   │
│  │    LLM Mock 引擎              │   │
│  │  - 路由匹配                   │   │
│  │  - 响应生成（含 SSE 流式）     │   │
│  │  - 延迟模拟                   │   │
│  │  - 日志记录                   │   │
│  └──────────────────────────────┘   │
│  Mock 服务端口 :9100                 │
└─────────────────────────────────────┘
```

### 2.2 Mock 路由管理

#### 2.2.1 路由列表

| 字段 | 说明 |
|------|------|
| HTTP 方法 | POST（默认）/ GET / PUT / DELETE |
| 路径 | 如 `/v1/chat/completions`，支持通配符 |
| 名称 | 路由显示名，如 "默认"、"GPT-4o 慢响应" |
| 状态 | 启用 / 禁用 |
| 响应格式 | JSON / TEXT / SSE (流式) |
| 命中次数 | 该路由被匹配的次数 |
| 最后命中 | 最后一次匹配时间 |

#### 2.2.2 路由操作

- **新建路由**：选择方法 + 输入路径 + 命名
- **编辑路由**：修改路由配置
- **删除路由**：确认后删除
- **启用/禁用**：快速开关
- **路由排序**：支持拖拽调整优先级（先匹配优先）
- **筛选**：全部 / 已启用 / 已禁用

#### 2.2.3 内置默认路由

系统预置一条默认路由，开箱即用：

| 方法 | 路径 | 名称 | 说明 |
|------|------|------|------|
| POST | /v1/chat/completions | 默认 Chat | OpenAI Chat Completions 兼容 |

### 2.3 Mock 配置

每条路由独立配置以下内容：

#### 2.3.1 基础配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 响应延迟 | 模拟网络延迟，单位 ms | 0 |
| 状态码 | HTTP 响应码 | 200 |
| 响应格式 | JSON / TEXT / SSE | JSON |

#### 2.3.2 响应模式（预设 + 自定义）

**预设模式**（一键切换，自动填充状态码、响应体、Headers）：

| 模式名 | 状态码 | 说明 | 响应体模板 |
|--------|--------|------|-----------|
| 正常响应 | 200 | 标准成功响应 | 可自定义的正常回复内容 |
| 429 限频 | 429 | Rate limit exceeded | `{"error":{"message":"Rate limit reached...","type":"tokens","code":"rate_limit_exceeded"}}` |
| 500 服务器错误 | 500 | Internal server error | `{"error":{"message":"The server had an error...","type":"server_error","code":"server_error"}}` |
| 401 未授权 | 401 | Invalid API key | `{"error":{"message":"Incorrect API key provided...","type":"invalid_request_error","code":"invalid_api_key"}}` |
| 400 context_length 超限 | 400 | 上下文长度超限 | `{"error":{"message":"This model's maximum context length is 8192 tokens...","type":"invalid_request_error","code":"context_length_exceeded"}}` |
| 403 配额用尽 | 403 | 配额不足 | `{"error":{"message":"You exceeded your current quota...","type":"insufficient_quota","code":"insufficient_quota"}}` |
| 408 超时 | 408 | 请求超时 | `{"error":{"message":"Request timed out","type":"timeout","code":"request_timeout"}}` |
| 自定义 | 自定义 | 完全自定义响应 | 用户自行编辑 |

选择预设模式时，自动填充所有相关字段（状态码、响应体、Headers），用户可在此基础上微调。

#### 2.3.3 响应体配置

- **正常模式**：
  - 固定文本：用户输入的文本作为 `choices[0].message.content`
  - 支持多行文本
  - 支持变量引用：`${request.model}`、`${request.messages[-1].content}` 等

- **错误模式**：
  - 预设自动填充标准 OpenAI 错误格式
  - 可切换到自定义 JSON 编辑

- **SSE 流式模式**：
  - 将响应内容按字/词拆分为多个 chunk
  - 每个 chunk 间隔可配（默认 50ms）
  - 格式兼容 `text/event-stream`，`data: {"choices":[{"delta":{"content":"..."}}]}`

#### 2.3.4 Token 配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 模式 | 自动 / 自定义 | 自动 |
| prompt_tokens | 自动模式下按请求内容估算，自定义时用户填写 | 自动计算 |
| completion_tokens | 自动模式下按响应内容估算，自定义时用户填写 | 自动计算 |
| total_tokens | prompt + completion | 自动计算 |

**自动模式**：按英文 ~4字符/token、中文 ~1.5字符/token 粗估。

#### 2.3.5 模型配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 模式 | 跟随请求 / 自定义 | 跟随请求 |
| 模型名 | 响应中返回的 model 字段 | `${request.model}` |

**跟随请求**：使用请求体中的 `model` 字段值。
**自定义**：固定返回指定模型名（如 `gpt-4o`、`deepseek-chat`）。

#### 2.3.6 响应头配置

**默认 Headers**（模拟真实 OpenAI 响应头）：

| Header | 默认值 | 可编辑 |
|--------|--------|--------|
| content-type | application/json | 自动根据格式 |
| x-request-id | 自动生成 UUID | 是 |
| openai-processing-ms | 根据延迟配置 | 是 |
| openai-version | 2024-06-01 | 是 |
| x-ratelimit-limit-requests | 10000 | 是 |
| x-ratelimit-remaining-requests | 9999 | 是 |

- 支持添加自定义 Header
- 支持删除非必需的默认 Header

### 2.4 请求日志

#### 2.4.1 日志列表

每次 Mock 服务收到请求时记录：

| 字段 | 说明 |
|------|------|
| 时间 | 请求到达时间，精确到 ms |
| 状态 | OK（2xx）/ error（4xx/5xx） |
| 方法 | HTTP 方法 |
| 路径 | 请求路径 |
| 请求模型 | 请求体中的 model |
| 响应模型 | 响应体中的 model |
| Token 数 | 响应的 total_tokens |
| 耗时 | 总处理时间（含模拟延迟） |

#### 2.4.2 日志筛选

- **状态筛选**：全部 / OK / Error
- **搜索**：按路径、模型名搜索
- **路由筛选**：当前路由 / 全部路由

#### 2.4.3 日志详情

点击日志条目查看详情：

- **基础信息**：时间、调用方（User-Agent）、IP、请求模型、响应模型、结果
- **耗时分析**：匹配耗时 + 首字节耗时 + 响应体耗时 = 总耗时（进度条可视化）
- **请求消息**：展示 messages 数组（system / user / assistant 分角色显示）
- **响应内容**：完整响应体

#### 2.4.4 日志操作

- **回放 (Replay)**：重新发送相同请求到 Mock 服务
- **导出 (Export)**：导出日志为 JSON
- **清空 (Clear)**：清空所有日志（需确认）

### 2.5 Mock 服务控制

#### 2.5.1 服务状态

- **启动/停止**：一键控制 Mock 服务
- **端口配置**：默认 9100，可修改
- **状态指示**：在页面顶部显示 `● LIVE :9100` 或 `○ STOPPED`

#### 2.5.2 请求捕获

- **Capture 模式**：开启时记录请求日志，关闭时不记录（服务仍可用）

---

## 三、页面布局

### 3.1 入口位置

在侧边栏「系统级菜单」中新增「工具」分组：

```
项目列表
──────────
环境配置
通知渠道
用户管理（admin）
操作日志
──────────
🔧 LLM Mock    ← 新增
```

### 3.2 页面结构

采用三栏布局（参考截图风格）：

```
┌─────────────────────────────────────────────────────────────────┐
│ LLM Mock                    ● LIVE :9100     [启动] [端口设置]  │
├───────────────┬─────────────────────────────────────────────────┤
│               │                                                 │
│  MOCK 路由     │   MOCK 配置                                     │
│  ┌───────────┐│   ┌─────────────────────────────────────────┐  │
│  │ [+ 新建]  ││   │ POST /v1/chat/completions    [保存][删除] │  │
│  ├───────────┤│   ├─────────────────────────────────────────┤  │
│  │ POST /    ││   │ 基础      │ 响应模式      │ Token/模型   │  │
│  │ 默认 Chat ││   │ 延迟: 0ms │ ● 正常响应    │ 模式: 自动   │  │
│  │ hits: 16  ││   │ 格式: JSON│ ○ 429 限频    │ 模型: 跟随   │  │
│  ├───────────┤│   │           │ ○ 500 错误    │              │  │
│  │ POST /err ││   │           │ ○ 401 未授权  │              │  │
│  │ 错误测试  ││   │           │ ○ 自定义...   │              │  │
│  │ hits: 3   ││   ├─────────────────────────────────────────┤  │
│  └───────────┘│   │ 响应头                         [+ 添加]  │  │
│               │   │ x-request-id: auto                       │  │
│  ┌───────────┐│   │ openai-version: 2024-06-01               │  │
│  │ 筛选:     ││   ├─────────────────────────────────────────┤  │
│  │ 全部|启用  ││   │ 响应体                                   │  │
│  │ |禁用     ││   │ ┌───────────────────────────────────┐   │  │
│  └───────────┘│   │ │ This is a mock response from the  │   │  │
│               │   │ │ LLM Mock service.                  │   │  │
│               │   │ └───────────────────────────────────┘   │  │
├───────────────┴─────────────────────────────────────────────────┤
│  REQUEST LOG                    [回放] [导出] [清空]             │
│  ┌──────────────────────────────┬───────────────────────────┐  │
│  │ 时间      状态  方法  路径   │  POST /  200 OK            │  │
│  │ 10:49:48  OK   POST  /     │  请求模型: deepseek-chat    │  │
│  │ 10:48:32  OK   POST  /     │  响应模型: deepseek-chat    │  │
│  │ 10:47:15  ERR  POST  /err  │  Token: 0k · 10t            │  │
│  │                             │  耗时: match 0ms            │  │
│  │  全部 | OK | Error          │       first-byte 0ms        │  │
│  │                             │       body 0ms              │  │
│  └──────────────────────────────┴───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、API 设计

### 4.1 管理 API（后端主服务）

#### 路由管理

```
GET    /api/llm-mock/routes                  # 列表
POST   /api/llm-mock/routes                  # 新建
PUT    /api/llm-mock/routes/:id              # 更新
DELETE /api/llm-mock/routes/:id              # 删除
PATCH  /api/llm-mock/routes/:id/toggle       # 启用/禁用
PUT    /api/llm-mock/routes/reorder          # 排序
```

#### 服务控制

```
GET    /api/llm-mock/status                  # 服务状态（运行中/已停止/端口）
POST   /api/llm-mock/start                   # 启动服务
POST   /api/llm-mock/stop                    # 停止服务
PUT    /api/llm-mock/config                  # 更新全局配置（端口等）
```

#### 请求日志

```
GET    /api/llm-mock/logs                    # 日志列表（分页 + 筛选）
GET    /api/llm-mock/logs/:id                # 日志详情
POST   /api/llm-mock/logs/:id/replay         # 回放
DELETE /api/llm-mock/logs                    # 清空日志
GET    /api/llm-mock/logs/export             # 导出
```

#### 预设模式

```
GET    /api/llm-mock/presets                 # 获取所有预设模式
```

### 4.2 Mock 服务 API（端口 9100）

Mock 服务暴露 OpenAI 兼容的 API：

```
POST   /v1/chat/completions                 # Chat Completions（主要接口）
GET    /v1/models                            # 模型列表（返回配置的模型）
```

响应格式完全兼容 OpenAI API 规范。

### 4.3 WebSocket（实时日志推送）

```
WS     /api/llm-mock/ws                     # 请求日志实时推送
```

---

## 五、数据模型

### 5.1 MockRoute（路由配置）

```python
class MockRoute:
    id: UUID
    name: str                      # 路由名称
    method: str                    # HTTP 方法 (POST)
    path: str                      # 路径 (/v1/chat/completions)
    enabled: bool                  # 是否启用
    sort_order: int                # 排序

    # 基础配置
    delay_ms: int                  # 响应延迟 (ms)
    status_code: int               # HTTP 状态码
    response_format: str           # json / text / sse

    # 响应模式
    preset_mode: str | None        # 预设模式名，null 为自定义

    # 响应体
    response_body: str             # 响应内容（文本或 JSON 字符串）

    # Token 配置
    token_mode: str                # auto / custom
    custom_prompt_tokens: int | None
    custom_completion_tokens: int | None

    # 模型配置
    model_mode: str                # follow_request / custom
    custom_model: str | None       # 自定义模型名

    # 响应头
    response_headers: dict         # 自定义响应头

    # SSE 配置
    sse_chunk_delay_ms: int        # 流式模式下每个 chunk 的间隔

    # 统计
    hit_count: int
    last_hit_at: datetime | None

    created_at: datetime
    updated_at: datetime
```

### 5.2 MockRequestLog（请求日志）

```python
class MockRequestLog:
    id: UUID
    route_id: UUID | None          # 匹配的路由 ID
    timestamp: datetime

    # 请求信息
    method: str
    path: str
    headers: dict
    body: dict                     # 请求体（messages 等）
    caller: str                    # User-Agent
    ip: str

    # 响应信息
    status_code: int
    response_body: str
    response_headers: dict

    # 解析字段
    request_model: str | None
    response_model: str | None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    finish_reason: str | None

    # 耗时
    match_ms: float                # 路由匹配耗时
    first_byte_ms: float           # 首字节耗时
    body_ms: float                 # 响应体传输耗时
    total_ms: float                # 总耗时
```

### 5.3 MockConfig（全局配置）

```python
class MockConfig:
    port: int = 9100               # Mock 服务端口
    capture_enabled: bool = True   # 是否记录日志
    max_log_count: int = 1000      # 最大日志条数（超过自动清理最早的）
```

---

## 六、非功能需求

| 项目 | 要求 |
|------|------|
| 性能 | Mock 服务响应延迟 < 5ms（不含模拟延迟） |
| 并发 | 支持至少 100 并发请求 |
| 存储 | 路由配置持久化到数据库，请求日志内存 + 数据库混合存储 |
| 兼容性 | 完全兼容 OpenAI Chat Completions API 格式 |
| 流式 | SSE 流式响应兼容 OpenAI streaming 格式 |

---

## 七、实现计划

### Phase 1：核心后端（Mock 引擎）
1. 数据模型 + Migration
2. Mock 路由管理 API
3. Mock 服务引擎（路由匹配 + 响应生成）
4. 预设模式实现
5. SSE 流式响应
6. 请求日志记录

### Phase 2：前端页面
1. LLM Mock 页面骨架（三栏布局）
2. 路由列表组件
3. Mock 配置面板（表单 + 预设模式选择）
4. 请求日志面板
5. 服务控制（启停 + 状态指示）

### Phase 3：增强功能
1. WebSocket 实时日志推送
2. 日志回放
3. 日志导出
4. Token 自动估算

---

## 附录 A：OpenAI API 响应规范（精确参考）

> 以下内容基于 OpenAI API 最新规范整理，Mock 服务必须严格遵守这些格式。

### A.1 Non-Streaming 成功响应（完整结构）

```json
{
  "id": "chatcmpl-B9MBs8CjcvOU2jLn4n570S5qMJKcT",
  "object": "chat.completion",
  "created": 1718200000,
  "model": "gpt-4o-2024-08-06",
  "system_fingerprint": "fp_44709d6fcb",
  "service_tier": "default",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 9,
    "total_tokens": 21,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  }
}
```

**Mock 必须实现的字段：**
- `id`：格式 `chatcmpl-` + 29~31位混合大小写字母数字（如 `chatcmpl-B9MBs8CjcvOU2jLn4n570S5qMJKcT`）
- `object`：固定 `"chat.completion"`
- `created`：Unix timestamp（秒）
- `model`：**注意 OpenAI 实际返回的是解析后的快照名**（如请求 `gpt-4o` 返回 `gpt-4o-2024-08-06`），Mock 的「跟随请求」模式直接返回请求值即可
- `choices[].message.content`：文本内容，tool_calls 模式下为 `null`（不是空字符串）
- `choices[].message.refusal`：拒绝消息，正常为 `null`
- `choices[].message.annotations`：标注数组，默认 `[]`
- `choices[].finish_reason`：见 A.3
- `usage`：token 统计

**可选但建议实现的字段：**
- `system_fingerprint`：格式 `fp_` + 10位 hex（如 `fp_44709d6fcb`），2025年已标记废弃但仍出现在响应中，Mock 返回固定值 `"fp_mock_v1"` 即可
- `service_tier`：`"default"` 或省略
- `usage.*_details`：新版 SDK 会读取这些子对象，建议返回全零子对象以保证兼容

### A.2 Streaming (SSE) 响应格式

**Content-Type**: `text/event-stream`

**第一个 chunk**（role 声明）：
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1718200000,"model":"gpt-4o","system_fingerprint":"fp_mock_v1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}

```

**中间 chunk**（内容逐字/逐词输出）：
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1718200000,"model":"gpt-4o","system_fingerprint":"fp_mock_v1","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}

```

**最后一个内容 chunk**（finish_reason）：
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1718200000,"model":"gpt-4o","system_fingerprint":"fp_mock_v1","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}

```

**Usage chunk**（仅当请求 `stream_options.include_usage: true` 时）：
```
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1718200000,"model":"gpt-4o","system_fingerprint":"fp_mock_v1","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":9,"total_tokens":21}}

```

**终止信号**：
```
data: [DONE]

```

**关键规则：**
- 每行 `data: ` 后跟 JSON，行尾两个 `\n\n`
- 所有 chunk 共享同一个 `id`
- `object` 固定为 `"chat.completion.chunk"`（注意不是 `.chunks`）
- `delta` 对象只包含该 chunk 新增的字段（不是完整 message）
- 第一个 chunk 含 `delta.role`，中间含 `delta.content`，最后一个 `delta` 为空对象 `{}`
- `[DONE]` 不是 JSON，是字面量字符串
- Mock 必须检查请求中的 `stream: true` 字段来决定是否流式返回

### A.3 finish_reason 完整枚举

| 值 | 触发条件 | Mock 场景 |
|----|---------|----------|
| `"stop"` | 正常结束，或命中 stop 序列 | 默认正常响应 |
| `"length"` | 达到 max_tokens 限制，输出被截断 | 模拟截断响应 |
| `"content_filter"` | 内容审核拦截 | 模拟安全过滤 |
| `"tool_calls"` | 模型决定调用工具 | Tool Calls 模式 |
| `"function_call"` | 旧版函数调用（已废弃） | 向后兼容 |

**注意边界情况：** OpenAI 偶尔会在 `tool_calls` 存在时返回 `finish_reason: "stop"` 而非 `"tool_calls"`。调用方应同时检查 `tool_calls` 字段是否存在，不能只依赖 `finish_reason`。Mock 服务应正确返回 `"tool_calls"`，但在文档中提醒用户这个已知问题。

### A.4 Tool Calls 响应格式

Tool Calls 是现代 LLM 的重要特性，Mock 服务需要支持。

**Non-streaming Tool Calls 响应：**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1718200000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\":\"Beijing\",\"unit\":\"celsius\"}"
            }
          }
        ],
        "refusal": null
      },
      "finish_reason": "tool_calls"
    }
  ],
  "usage": { "prompt_tokens": 50, "completion_tokens": 20, "total_tokens": 70 }
}
```

**关键细节：**
- `content` 为 `null`（不是空字符串）
- `tool_calls[].function.arguments` 是 **JSON 字符串**（不是对象）
- `tool_calls[].id` 格式 `call_` + 随机字符串
- 可以有多个 tool_calls（并行调用）
- `finish_reason` 为 `"tool_calls"`

**Streaming Tool Calls**（分 chunk 发送 arguments）：
```
data: {"choices":[{"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"lo"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"cation"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\":\"Beijing\"}"}}]}}]}

data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}

data: [DONE]
```

### A.5 完整错误响应格式

```json
{
  "error": {
    "message": "详细错误描述",
    "type": "错误类型",
    "param": null,
    "code": "错误码"
  }
}
```

**完整错误预设表（v2 更新）：**

| 预设名 | HTTP | type | code | message 模板 | Retry-After |
|--------|------|------|------|-------------|-------------|
| 正常响应 | 200 | - | - | 正常内容 | - |
| 429 限频 (RPM) | 429 | `requests` | `rate_limit_exceeded` | `Rate limit reached for gpt-4o in organization org-xxx on requests per min (RPM): Limit 500, Used 500, Requested 1.` | `20s` |
| 429 限频 (TPM) | 429 | `tokens` | `rate_limit_exceeded` | `Rate limit reached for gpt-4o on tokens per min (TPM): Limit 30000, Used 28500, Requested 2000.` | `2s` |
| 500 服务器错误 | 500 | `server_error` | `server_error` | `The server had an error while processing your request. Sorry about that!` | - |
| 502 网关错误 | 502 | `server_error` | `bad_gateway` | `Bad gateway.` | - |
| 503 过载 | 503 | `server_error` | `service_unavailable` | `The engine is currently overloaded, please try again later.` | - |
| 401 无效 Key | 401 | `invalid_request_error` | `invalid_api_key` | `Incorrect API key provided: sk-proj-****xxxx. You can find your API key at https://platform.openai.com/account/api-keys.` | - |
| 401 缺少 Key | 401 | `invalid_request_error` | `missing_api_key` | `You didn't provide an API key...` | - |
| 403 配额用尽 | 403 | `insufficient_quota` | `insufficient_quota` | `You exceeded your current quota, please check your plan and billing details.` | - |
| 403 地区不支持 | 403 | `unsupported_country` | `unsupported_country` | `Country, region, or territory not supported.` | - |
| 400 context 超限 | 400 | `invalid_request_error` | `context_length_exceeded` | `This model's maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens. Please reduce the length of the messages.` | - |
| 400 无效模型 | 404 | `invalid_request_error` | `model_not_found` | `The model 'gpt-5-turbo' does not exist or you do not have access to it.` | - |
| 400 参数错误 | 400 | `invalid_request_error` | `invalid_request` | `Invalid value for 'temperature': expected a value between 0 and 2, got 3.5.` | - |
| 内容审核拦截 | 400 | `invalid_request_error` | `content_policy_violation` | `Your request was rejected as a result of our safety system.` | - |
| 408 超时 | 408 | `timeout` | `request_timeout` | `Request timed out.` | - |

### A.6 响应头完整规范

**成功响应头：**

| Header | 示例值 | 说明 |
|--------|-------|------|
| `content-type` | `application/json` 或 `text/event-stream; charset=utf-8` | 根据 stream 切换 |
| `x-request-id` | `req_abc123def456` | 格式 `req_` + 随机串 |
| `openai-processing-ms` | `234` | 处理耗时(ms) |
| `openai-version` | `2024-06-01` | API 版本 |
| `openai-organization` | `org-xxxxxxxx` | 组织 ID |
| `x-ratelimit-limit-requests` | `10000` | RPM 限制 |
| `x-ratelimit-limit-tokens` | `2000000` | TPM 限制 |
| `x-ratelimit-remaining-requests` | `9999` | 剩余 RPM |
| `x-ratelimit-remaining-tokens` | `1999500` | 剩余 TPM |
| `x-ratelimit-reset-requests` | `6ms` | RPM 重置时间 |
| `x-ratelimit-reset-tokens` | `15ms` | TPM 重置时间 |

**错误响应头（429 限频）额外增加：**

| Header | 示例值 |
|--------|-------|
| `retry-after-ms` | `5000`（毫秒，优先检查此字段） |
| `retry-after` | `5`（秒，备用） |

**注意：** 429 有两种含义：`rate_limit_exceeded`（可重试，等待后重试）和 `insufficient_quota`（不可重试，需充值）。Mock 预设分开提供这两种。

**流式响应头额外注意：**
- `transfer-encoding: chunked`
- `connection: keep-alive`
- `cache-control: no-cache`

---

## 附录 B：v2 新增功能（深入研究后补充）

### B.1 Tool Calls Mock 支持

**为什么重要：** 现代 AI 应用大量使用 function calling / tool use，如果 Mock 不支持 tool_calls，就无法测试 Agent 工作流、RAG 系统、MCP 等场景。

**配置项新增：**

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 响应类型 | 文本回复 / Tool Calls | 文本回复 |
| Tool Calls 列表 | 可添加多个工具调用 | 空 |
| 每个调用: name | 函数名 | - |
| 每个调用: arguments | JSON 字符串 | `{}` |

### B.2 finish_reason 可选

允许用户配置 `finish_reason`，预设选项：

| 选项 | 适用场景 |
|------|---------|
| `stop`（默认） | 正常结束 |
| `length` | 测试截断处理逻辑 |
| `content_filter` | 测试内容审核处理 |
| `tool_calls` | 测试工具调用流程 |

### B.3 Streaming 智能行为

Mock 服务应自动检测请求中的 `stream` 字段：

| 请求参数 | Mock 行为 |
|---------|----------|
| `stream: false` 或未设置 | 返回完整 JSON 响应 |
| `stream: true` | 返回 SSE 流式响应 |
| `stream: true` + `stream_options.include_usage: true` | 流式 + 末尾附加 usage chunk |

**这意味着同一个路由可以同时处理流式和非流式请求**，无需为两种模式创建两条路由。

### B.4 多 Provider 兼容注意事项

团队可能不只用 OpenAI，还会用 DeepSeek、通义千问、Claude 等的 OpenAI 兼容模式。Mock 需要注意：

| Provider | 兼容差异 |
|----------|---------|
| DeepSeek | 额外字段 `reasoning_content`（思考过程）在 `delta` 中出现 |
| 通义千问 (Qwen) | 基本兼容，`model` 字段可能返回内部模型名 |
| Claude (via proxy) | 部分代理层会添加 `anthropic-*` 前缀 header |
| Ollama | 额外 `eval_count`、`eval_duration` 等性能字段 |

**建议：** Mock 响应只返回标准 OpenAI 字段，不添加非标准字段，保证最大兼容。但在路由配置中提供「额外字段」的 JSON 编辑区域，供用户按需添加。

### B.5 生产环境注意点

#### 端口安全
- Mock 服务默认监听 `0.0.0.0:9100`，生产环境应限制为 `127.0.0.1` 或内网
- 建议增加一个「监听地址」配置项（`0.0.0.0` / `127.0.0.1`）

#### 日志内存管理
- 请求日志存内存会导致 OOM — 必须设上限（默认 1000 条，超过淘汰最早的）
- 日志中的 `body`（请求体）可能很大（长 prompt），应截断存储或分开存

#### SSE 连接管理
- 客户端可能中途断开流式连接 — Mock 需要正确处理 `ConnectionResetError`
- 建议流式响应设置超时上限（如 5 分钟），防止僵死连接

#### CORS 支持
- 如果前端 JS 直接调 Mock 服务（如 React 应用测试），需要配置 CORS headers
- 建议 Mock 服务默认启用 `Access-Control-Allow-Origin: *`

#### API Key 验证模式
- **透传模式**（默认）：不验证请求中的 Authorization header
- **严格模式**（可选）：要求携带特定 key，用于测试 key 缺失/错误的处理逻辑

### B.6 响应体模板变量

支持在响应体中引用请求信息（动态响应）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `${request.model}` | 请求中的 model | `gpt-4o` |
| `${request.messages[-1].content}` | 最后一条用户消息 | `你好` |
| `${request.messages.length}` | 消息数量 | `3` |
| `${random.uuid}` | 随机 UUID | `abc123...` |
| `${timestamp}` | 当前 Unix 时间戳 | `1718200000` |
| `${route.name}` | 当前路由名称 | `默认 Chat` |

### B.7 更新后的预设模式列表

将预设分为三组，前端用 OptGroup 分组展示：

**正常响应（Normal）：**
| 预设 | 说明 |
|------|------|
| 正常 - 文本回复 | 200，标准文本响应 |
| 正常 - Tool Calls | 200，返回工具调用 |
| 正常 - 截断 (length) | 200，finish_reason=length，内容被截断 |
| 正常 - 内容过滤 | 200，finish_reason=content_filter，content 为 null |
| 正常 - 模型拒绝 | 200，content=null，refusal 包含拒绝原因 |
| 正常 - Tool Calls 截断 | 200，finish_reason=length，arguments 为不完整 JSON |

**客户端错误（4xx）：**
| 预设 | 说明 |
|------|------|
| 400 参数错误 | invalid_request |
| 400 context 超限 | context_length_exceeded |
| 401 无效 Key | invalid_api_key |
| 401 缺少 Key | missing_api_key |
| 403 配额用尽 | insufficient_quota |
| 403 地区不支持 | unsupported_country |
| 404 模型不存在 | model_not_found |
| 408 请求超时 | request_timeout |
| 429 限频 (RPM) | rate_limit_exceeded (requests) |
| 429 限频 (TPM) | rate_limit_exceeded (tokens) |

**服务端错误（5xx）：**
| 预设 | 说明 |
|------|------|
| 500 服务器错误 | server_error |
| 502 网关错误 | bad_gateway |
| 503 过载 | service_unavailable |
