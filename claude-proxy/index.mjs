/**
 * Claude Proxy — 将 OpenAI 兼容 API 请求转发给 Claude Code CLI
 *
 * 两种模式：
 *   1. 普通对话（无 tools）: 直接通过 porygon 调用 Claude CLI
 *   2. 工具调用（有 tools）: 将工具定义注入 system prompt，解析 <tool_call> 块
 *      返回标准 OpenAI tool_calls 格式，支持多轮对话
 *
 * 环境变量（通过 compose.yaml 注入）：
 *   ANTHROPIC_AUTH_TOKEN  — 公司网关 token（gw-xxx），透传给 claude CLI 子进程
 *   ANTHROPIC_BASE_URL    — 公司网关地址（可选）
 *   CLAUDE_PROXY_PORT     — 监听端口，默认 3001
 *   CLAUDE_PROXY_HOST     — 监听地址，默认 0.0.0.0（Docker 容器内必须绑定全接口）
 *   CLAUDE_PROXY_MODEL    — 默认 Claude 模型，默认 claude-sonnet-4-6
 */

import { createPorygon } from "@snack-kit/porygon";
import http from "node:http";

const PORT = parseInt(process.env.CLAUDE_PROXY_PORT || "3001");
const DEFAULT_MODEL = process.env.CLAUDE_PROXY_MODEL || process.env.DEFAULT_LLM_MODEL || "claude-sonnet-4-6";
const ENV_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.ANTHROPIC_BASE_URL;

if (!ENV_AUTH_TOKEN) {
  console.warn("[claude-proxy] 警告: ANTHROPIC_AUTH_TOKEN 未设置，将完全依赖请求头传入的 token");
}
if (BASE_URL) {
  console.log(`[claude-proxy] 网关地址: ${BASE_URL}`);
}

const porygon = createPorygon({
  defaultBackend: "claude",
  backends: {
    claude: {
      model: DEFAULT_MODEL,
      interactive: false,
      streamPartialMessages: true,
    },
  },
  defaults: {
    maxTurns: 1,
    timeoutMs: 1_800_000,
  },
});

const ALL_CLAUDE_TOOLS = [
  "Bash", "Read", "Write", "Edit",
  "WebFetch", "WebSearch",
  "Agent", "TodoWrite",
  "NotebookEdit",
];

// ─── Tool calling support ─────────────────────────────────────────────────────

/**
 * 将 OpenAI tools 数组转成注入 system prompt 的说明文本。
 * Claude 需要严格按 <tool_call>...</tool_call> 格式输出才能被解析。
 */
function toolsToSystemSection(tools) {
  const defs = tools.map((t) => {
    const fn = t.function || t;
    const params = fn.parameters ? JSON.stringify(fn.parameters, null, 2) : "{}";
    return `### ${fn.name}\n描述: ${fn.description || "(无描述)"}\n参数 schema:\n\`\`\`json\n${params}\n\`\`\``;
  }).join("\n\n");

  return `\n\n## 工具调用规则

你可以调用以下工具完成任务。**调用工具时，必须严格输出以下格式，且该格式必须是消息的全部内容（不要加任何前缀文字）**：

<tool_call>
{"name": "工具名", "arguments": {参数JSON}}
</tool_call>

收到工具结果后，可以继续调用下一个工具，或者输出最终文字答复。

## 可用工具

${defs}`;
}

/** 从 Claude 输出文本中提取 tool_call 块，返回 OpenAI tool_calls 数组或 null。 */
function parseToolCalls(text) {
  // 匹配 <tool_call>...</tool_call>，允许内部换行
  const pattern = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/;
  const match = text.match(pattern);
  if (!match) return null;

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    // 尝试宽松解析：有时模型用单引号或多余逗号
    try {
      // 用 eval 做最后尝试（仅在 Node.js 内部使用，不暴露外部输入）
      parsed = (new Function(`return (${match[1]})`)());
    } catch {
      console.warn("[claude-proxy] tool_call JSON 解析失败:", match[1].slice(0, 200));
      return null;
    }
  }

  if (!parsed?.name) return null;

  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return [{
    id: callId,
    type: "function",
    function: {
      name: String(parsed.name),
      arguments: JSON.stringify(parsed.arguments ?? {}),
    },
  }];
}

/**
 * 将带有 tool/assistant(tool_calls) 角色的 OpenAI messages 转成
 * Claude 可理解的文本对话格式。
 */
function normalizeMessages(messages) {
  return messages.map((msg) => {
    // tool 角色 → user，前缀标注工具名和 call_id
    if (msg.role === "tool") {
      const header = msg.name
        ? `[工具返回 tool=${msg.name} call_id=${msg.tool_call_id ?? "?"}]`
        : `[工具返回 call_id=${msg.tool_call_id ?? "?"}]`;
      return { role: "user", content: `${header}\n${msg.content ?? ""}` };
    }

    // assistant 含 tool_calls → 还原为 <tool_call> 格式文本
    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const blocks = msg.tool_calls.map((tc) => {
        let args;
        try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { args = {}; }
        return `<tool_call>\n${JSON.stringify({ name: tc.function?.name, arguments: args }, null, 2)}\n</tool_call>`;
      });
      return { role: "assistant", content: blocks.join("\n") };
    }

    return msg;
  });
}

// ─── Message / Response helpers ───────────────────────────────────────────────

function convertMessages(messages) {
  const systemParts = [];
  const convParts = [];

  for (const msg of messages) {
    const text =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
        ? msg.content.map((c) => c.text ?? "").join("")
        : "";

    if (msg.role === "system") {
      systemParts.push(text);
    } else {
      const label = msg.role === "user" ? "Human" : "Assistant";
      convParts.push(`${label}: ${text}`);
    }
  }

  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    prompt: convParts.join("\n\n"),
  };
}

function makeId() {
  return `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildResponse(model, text, toolCalls) {
  const message = toolCalls
    ? { role: "assistant", content: null, tool_calls: toolCalls }
    : { role: "assistant", content: text };
  return {
    id: makeId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls ? "tool_calls" : "stop",
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function buildStreamChunk(id, model, delta, finishReason = null, toolCalls = null) {
  let deltaObj;
  if (toolCalls) {
    deltaObj = { role: "assistant", content: null, tool_calls: toolCalls };
  } else if (finishReason) {
    deltaObj = {};
  } else {
    deltaObj = { role: "assistant", content: delta };
  }
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: deltaObj,
      finish_reason: finishReason ?? (toolCalls ? "tool_calls" : null),
    }],
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", model: DEFAULT_MODEL }));
    return;
  }

  // 多轮 Agent 任务（含 MCP 工具支持）
  if (req.method === "POST" && req.url?.includes("/v1/agentic/run")) {
    await handleAgenticRun(req, res);
    return;
  }

  if (req.method !== "POST" || !req.url?.includes("/v1/chat/completions")) {
    res.writeHead(404);
    res.end();
    return;
  }

  let payload;
  try {
    const body = await readBody(req);
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Invalid JSON", type: "invalid_request_error" } }));
    return;
  }

  const { messages = [], model: rawModel = DEFAULT_MODEL, stream = false, tools } = payload;
  // 非 Claude 模型名（如 deepseek-chat）无法被 Claude CLI 处理，回落到 DEFAULT_MODEL
  const model = (rawModel && rawModel.startsWith("claude-")) ? rawModel : DEFAULT_MODEL;
  const hasTools = Array.isArray(tools) && tools.length > 0;
  console.log(`[claude-proxy] 收到请求: rawModel=${rawModel} effectiveModel=${model} stream=${stream} hasTools=${hasTools} msgs=${messages.length}`);

  // 归一化消息（处理 tool/assistant tool_calls 角色）
  const normalizedMessages = hasTools ? normalizeMessages(messages) : messages;
  const { systemPrompt: baseSystem, prompt } = convertMessages(normalizedMessages);

  // 有 tools 时，在 system prompt 末尾注入工具说明
  const systemPrompt = hasTools
    ? (baseSystem ?? "") + toolsToSystemSection(tools)
    : baseSystem;

  const authHeader = req.headers["authorization"] || "";
  const requestToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const authToken = (requestToken && requestToken !== "none") ? requestToken : ENV_AUTH_TOKEN;

  if (!prompt) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "No user messages", type: "invalid_request_error" } }));
    return;
  }

  // Pass auth via BOTH channels:
  // 1. request.envVars — required because porygon.query() strips all ANTHROPIC_* from
  //    process.env when building cleanEnv for the spawned CLI (see porygon dist/index.js).
  // 2. process.env — belt-and-suspenders for code paths that don't use envVars.
  if (authToken) {
    process.env.ANTHROPIC_AUTH_TOKEN = authToken;
    process.env.ANTHROPIC_API_KEY = authToken;
  }
  const request = {
    prompt,
    ...(systemPrompt !== undefined && { systemPrompt }),
    model,
    disallowedTools: ALL_CLAUDE_TOOLS,
    envVars: {
      ...(authToken && { ANTHROPIC_AUTH_TOKEN: authToken }),
      ...(authToken && { ANTHROPIC_API_KEY: authToken }),
      ...(BASE_URL && { ANTHROPIC_BASE_URL: BASE_URL }),
    },
  };

  try {
    if (stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": connected\n\n");

      const keepaliveTimer = setInterval(() => {
        if (!res.writableEnded) res.write(": keepalive\n\n");
      }, 20_000);

      const chunkId = makeId();
      let fullText = "";
      let eventCount = 0;
      let responseSent = false;
      // buffer 住 assistant 文字，等到 generator 结束或 tool_use 到来再决定发什么
      let pendingAssistantText = null;

      // 提取 assistant event 中的纯文本（过滤 thinking 块）
      function extractAssistantText(msg) {
        const content = msg.raw?.message?.content;
        if (Array.isArray(content)) {
          return content.filter(b => b.type === "text").map(b => b.text || "").join("");
        }
        return msg.text || "";
      }

      function sendToolCalls(openAIToolCalls) {
        if (responseSent || res.writableEnded) return;
        responseSent = true;
        pendingAssistantText = null;
        console.log(`[claude-proxy] 发送 tool_calls: ${openAIToolCalls.map(tc => tc.function.name).join(", ")}`);
        const tcChunk = buildStreamChunk(chunkId, model, "", null, openAIToolCalls);
        res.write(`data: ${JSON.stringify(tcChunk)}\n\n`);
        const done = buildStreamChunk(chunkId, model, "", "tool_calls");
        res.write(`data: ${JSON.stringify(done)}\n\n`);
        res.write("data: [DONE]\n\n");
      }

      function sendAssistantResponse(finalText) {
        if (responseSent || res.writableEnded) return;
        responseSent = true;
        if (hasTools) {
          const toolCalls = parseToolCalls(finalText);
          if (toolCalls) {
            console.log(`[claude-proxy] 发送 tool_calls (XML): ${toolCalls[0]?.function?.name}`);
            const tcChunk = buildStreamChunk(chunkId, model, "", null, toolCalls);
            res.write(`data: ${JSON.stringify(tcChunk)}\n\n`);
            const done = buildStreamChunk(chunkId, model, "", "tool_calls");
            res.write(`data: ${JSON.stringify(done)}\n\n`);
          } else {
            console.log(`[claude-proxy] 无 tool_call，发送文字 len=${finalText.length}`);
            const textChunk = buildStreamChunk(chunkId, model, finalText || " ");
            res.write(`data: ${JSON.stringify(textChunk)}\n\n`);
            const done = buildStreamChunk(chunkId, model, "", "stop");
            res.write(`data: ${JSON.stringify(done)}\n\n`);
          }
        } else {
          // 无 tools — stream_chunk 已实时发送，此处补 stop 信号
          const done = buildStreamChunk(chunkId, model, "", "stop");
          res.write(`data: ${JSON.stringify(done)}\n\n`);
        }
        res.write("data: [DONE]\n\n");
      }

      function extractNativeToolCalls(msg) {
        // porygon tool_use events use `toolName` (not `name`)
        const name = msg.name || msg.toolName;
        if (name) {
          const callId = msg.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          return [{ id: callId, type: "function", function: { name: String(name), arguments: JSON.stringify(msg.input ?? {}) } }];
        }
        const rawContent = msg.raw?.message?.content;
        if (Array.isArray(rawContent)) {
          const tuBlocks = rawContent.filter(b => b.type === "tool_use");
          if (tuBlocks.length > 0) {
            return tuBlocks.map(b => ({
              id: b.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              type: "function",
              function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
            }));
          }
        }
        return null;
      }

      try {
        for await (const msg of porygon.query(request)) {
          eventCount++;
          if (msg.type !== "system") {
            console.log(`[claude-proxy] porygon event #${eventCount}: type=${msg.type} text_len=${msg.text?.length ?? 0}`);
          }
          if (msg.type === "stream_chunk") {
            fullText += msg.text;
            if (!hasTools) {
              const chunk = buildStreamChunk(chunkId, model, msg.text);
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          } else if (msg.type === "assistant") {
            // 检查 raw 消息里是否已有 tool_use 块
            const rawContent = msg.raw?.message?.content;
            const rawToolUseBlocks = Array.isArray(rawContent)
              ? rawContent.filter(b => b.type === "tool_use")
              : [];

            if (rawToolUseBlocks.length > 0 && hasTools) {
              // 消息里已含 tool_use → 直接发工具调用，不 buffer
              const openAIToolCalls = rawToolUseBlocks.map(b => ({
                id: b.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: "function",
                function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
              }));
              console.log(`[claude-proxy] assistant 含 tool_use → tool_calls: ${openAIToolCalls.map(tc => tc.function.name).join(", ")}`);
              sendToolCalls(openAIToolCalls);
            } else {
              // 纯文字响应：先 buffer，等后续 tool_use 事件决定是否发送
              const assistantText = extractAssistantText(msg);
              const finalText = assistantText.trim() || fullText;
              console.log(`[claude-proxy] assistant event: text_len=${assistantText.length} → buffering`);
              pendingAssistantText = finalText;
            }
          } else if (msg.type === "tool_use") {
            // tool_use 事件：优先于 buffer 中的 assistant 文字
            const openAIToolCalls = extractNativeToolCalls(msg);
            if (openAIToolCalls && hasTools) {
              console.log(`[claude-proxy] tool_use → tool_calls: ${openAIToolCalls.map(tc => tc.function.name).join(", ")}`);
              sendToolCalls(openAIToolCalls);
            }
          } else if (msg.type === "result") {
            // 某些版本 porygon 仍发 result 事件
            const finalText = (msg.text && msg.text.trim()) ? msg.text : (pendingAssistantText ?? fullText);
            console.log(`[claude-proxy] result event: text_len=${msg.text?.length ?? 0}`);
            pendingAssistantText = null;
            sendAssistantResponse(finalText);
          } else if (msg.type === "error") {
            console.error("[claude-proxy] porygon 错误:", msg.message);
            if (!responseSent && !res.writableEnded) {
              responseSent = true;
              const errChunk = buildStreamChunk(chunkId, model, `[AGENT ERROR: ${msg.message}]`);
              res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
              const errDone = buildStreamChunk(chunkId, model, "", "stop");
              res.write(`data: ${JSON.stringify(errDone)}\n\n`);
              res.write("data: [DONE]\n\n");
            }
          } else if (msg.type !== "system") {
            console.warn(`[claude-proxy] 未处理的 porygon event: ${msg.type}`, JSON.stringify(msg).slice(0, 200));
          }
        }
        console.log(`[claude-proxy] generator 结束: events=${eventCount} fullText_len=${fullText.length} responseSent=${responseSent} pending=${pendingAssistantText !== null}`);
        // generator 结束后，发出 buffer 中积压的 assistant 文字（无后续 tool_use）
        if (!responseSent) {
          if (pendingAssistantText !== null) {
            console.log(`[claude-proxy] flush pending assistant text len=${pendingAssistantText.length}`);
            sendAssistantResponse(pendingAssistantText);
          } else {
            console.error("[claude-proxy] generator 结束但未发送响应，发送占位 delta");
            responseSent = true;
            const placeholderChunk = buildStreamChunk(chunkId, model, "[NO_OUTPUT]");
            res.write(`data: ${JSON.stringify(placeholderChunk)}\n\n`);
            const done = buildStreamChunk(chunkId, model, "", "stop");
            res.write(`data: ${JSON.stringify(done)}\n\n`);
            res.write("data: [DONE]\n\n");
          }
        }
      } finally {
        clearInterval(keepaliveTimer);
      }
      res.end();

    } else {
      // 非流式
      const text = await porygon.run(request);
      if (hasTools) {
        const toolCalls = parseToolCalls(text);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildResponse(model, text, toolCalls)));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildResponse(model, text, null)));
      }
    }
  } catch (err) {
    console.error("[claude-proxy] 请求处理失败:", err.message);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: err.message, type: "proxy_error" } }));
    } else {
      res.end();
    }
  }
});

const PROXY_HOST = process.env.CLAUDE_PROXY_HOST || "0.0.0.0";
server.listen(PORT, PROXY_HOST, () => {
  console.log(`[claude-proxy] 监听 http://${PROXY_HOST}:${PORT}/v1/`);
  console.log(`[claude-proxy] 默认模型: ${DEFAULT_MODEL}`);
  console.log(`[claude-proxy] 认证: ${ENV_AUTH_TOKEN ? "env ANTHROPIC_AUTH_TOKEN 已设置（兜底）" : "仅依赖请求头传入"}`);
  console.log(`[claude-proxy] 工具调用: 已启用（prompt engineering 模式）`);
});

async function shutdown() {
  console.log("[claude-proxy] 正在关闭...");
  await porygon.dispose();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
