FROM node:22-alpine

# IMPORTANT: claude CLI refuses --dangerously-skip-permissions when running as root.
# Removing the non-root user below will cause all LLM proxy requests to return 500.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install claude CLI globally as root (accessible to all users via PATH)
RUN npm install -g @anthropic-ai/claude-code

# Claude Code CLI refuses --dangerously-skip-permissions as root
RUN addgroup -S claude && adduser -S claude -G claude

WORKDIR /app
COPY package.json .
COPY index.mjs .
RUN npm install && chown -R appuser:appgroup /app

# Patch @snack-kit/porygon: 为 SSE 类型的 MCP server 补充 type:"sse" 字段。
# porygon 默认只传 url，缺少 type 字段导致 claude CLI 无法识别 SSE 协议，MCP 工具不可用。
RUN sed -i 's/\.\.\.config\.url ? { url: config\.url } : {}/.\.\.config.url ? { url: config.url, type: "sse" } : {}/g' \
      /app/node_modules/@snack-kit/porygon/dist/index.js

USER appuser

USER claude

EXPOSE 3001
CMD ["node", "index.mjs"]
