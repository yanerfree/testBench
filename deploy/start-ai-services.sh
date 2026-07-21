#!/usr/bin/env bash
# 启动 UI 脚本生成依赖的两个长驻服务（高端口段，避免冲突）：
#   - claude-proxy   :38210  （对内 OpenAI 兼容，对外 spawn 真 claude CLI，绕开网关对 SDK 的 429 限流）
#   - playwright-mcp :38931  （SSE，供 MCP Agent 操控真实浏览器）
# 幂等：先停占用这些端口的旧实例再启。日志写到 deploy/logs/。
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO/deploy/logs"
mkdir -p "$LOG_DIR"

CLAUDE_PROXY_PORT=38210
PLAYWRIGHT_MCP_PORT=38931

# 读网关 token / 地址
set -a; . "$REPO/backend/.env" 2>/dev/null; set +a
GW_TOKEN="${AI_AUTH_TOKEN:-${ANTHROPIC_AUTH_TOKEN:-}}"
GW_BASE="http://192.168.51.10:8080"   # 公司网关（不带 /v1，claude CLI 自己补路径）
PW_CONFIG="$REPO/backend/playwright-mcp-config.json"

kill_port() {
  local port="$1"
  local pids
  pids=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u)
  if [ -n "$pids" ]; then
    echo "  停止占用 :$port 的进程: $pids"
    kill $pids 2>/dev/null; sleep 1
  fi
}

echo "== 停旧实例 =="
kill_port "$CLAUDE_PROXY_PORT"
kill_port "$PLAYWRIGHT_MCP_PORT"

echo "== 启动 claude-proxy :$CLAUDE_PROXY_PORT =="
( cd "$REPO/claude-proxy" && \
  CLAUDE_PROXY_PORT="$CLAUDE_PROXY_PORT" CLAUDE_PROXY_HOST=127.0.0.1 \
  ANTHROPIC_BASE_URL="$GW_BASE" ANTHROPIC_AUTH_TOKEN="$GW_TOKEN" \
  CLAUDE_PROXY_MODEL="${AI_UI_MODEL:-claude-sonnet-4-6}" \
  nohup node index.mjs > "$LOG_DIR/claude-proxy.log" 2>&1 & echo "  pid=$!" )

echo "== 启动 playwright-mcp :$PLAYWRIGHT_MCP_PORT =="
CFG_ARG=""; [ -f "$PW_CONFIG" ] && CFG_ARG="--config $PW_CONFIG"
nohup npx --yes @playwright/mcp@latest \
  --port "$PLAYWRIGHT_MCP_PORT" --host 127.0.0.1 \
  --headless --browser chromium --no-sandbox --isolated --caps devtools $CFG_ARG \
  > "$LOG_DIR/playwright-mcp.log" 2>&1 & echo "  pid=$!"

echo "== 健康检查（最多等 15s）=="
for i in $(seq 1 15); do
  sleep 1
  cp_ok=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$CLAUDE_PROXY_PORT/health" 2>/dev/null)
  pw_ok=$(curl -s -o /dev/null -w "%{http_code}" -H "Accept: text/event-stream" --max-time 1 "http://localhost:$PLAYWRIGHT_MCP_PORT/sse" 2>/dev/null)
  # playwright /sse 会保持连接，curl --max-time 1 返回 000(超时)也算已监听
  if [ "$cp_ok" = "200" ]; then break; fi
done
echo "  claude-proxy /health -> ${cp_ok:-?}"
echo "  playwright-mcp :$PLAYWRIGHT_MCP_PORT 监听 -> $(ss -ltn 2>/dev/null | grep -q ":$PLAYWRIGHT_MCP_PORT " && echo yes || echo no)"
echo ""
echo "在 backend/.env 确认："
echo "  AI_UI_BASE_URL=http://localhost:$CLAUDE_PROXY_PORT/v1"
echo "  PLAYWRIGHT_MCP_URL=http://localhost:$PLAYWRIGHT_MCP_PORT/sse"
