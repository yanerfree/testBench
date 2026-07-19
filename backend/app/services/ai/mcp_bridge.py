"""Playwright MCP Bridge — 通过 stdio 连接 Playwright MCP Server，调用浏览器工具。

参考 ThemisAI mcp_bridge.py，简化为 stdio 传输（不依赖 LangChain）。
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

MCP_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "playwright-mcp-config.json",
)


class PlaywrightMCPBridge:
    """通过 stdio 启动并连接 Playwright MCP Server。"""

    def __init__(self, *, headless: bool = True, config_path: str | None = None) -> None:
        self._headless = headless
        self._config_path = config_path or MCP_CONFIG_PATH
        self._session = None
        self._stdio_cm = None
        self._session_cm = None
        self._tools_cache: list[dict] | None = None

    async def connect(self) -> None:
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client

        args = ["@playwright/mcp@latest"]
        if self._headless:
            args.append("--headless")
        if os.path.isfile(self._config_path):
            args.extend(["--config", self._config_path])

        params = StdioServerParameters(
            command="npx",
            args=args,
            env={**os.environ, "NODE_NO_WARNINGS": "1"},
        )

        self._stdio_cm = stdio_client(params)
        read_stream, write_stream = await self._stdio_cm.__aenter__()
        self._session_cm = ClientSession(read_stream, write_stream)
        self._session = await self._session_cm.__aenter__()
        await self._session.initialize()
        logger.info("playwright_mcp_connected (stdio, headless=%s)", self._headless)

    async def close(self) -> None:
        if self._session:
            try:
                await self._session.call_tool("browser_close", {})
            except Exception:
                pass
        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception:
                pass
        if self._stdio_cm:
            try:
                await self._stdio_cm.__aexit__(None, None, None)
            except Exception:
                pass
        self._session = None
        self._tools_cache = None
        logger.info("playwright_mcp_disconnected")

    async def list_tools(self) -> list[dict]:
        """列出所有可用的 MCP 工具，返回 [{name, description, input_schema}]"""
        if self._tools_cache is not None:
            return self._tools_cache
        if not self._session:
            raise RuntimeError("Not connected to Playwright MCP")
        result = await self._session.list_tools()
        self._tools_cache = [
            {
                "name": t.name,
                "description": t.description or "",
                "input_schema": t.inputSchema if hasattr(t, "inputSchema") else {},
            }
            for t in result.tools
        ]
        logger.info("playwright_tools_discovered count=%d", len(self._tools_cache))
        return self._tools_cache

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        """调用 MCP 工具，返回文本结果。"""
        if not self._session:
            raise RuntimeError("Not connected to Playwright MCP")
        cleaned = {k: v for k, v in arguments.items() if v is not None}
        log_args = {
            k: (v[:80] if isinstance(v, str) and len(v) > 80 else v)
            for k, v in cleaned.items()
        }
        logger.info("mcp_tool_call tool=%s args=%s", name, log_args)
        try:
            result = await self._session.call_tool(name, cleaned)
        except Exception as exc:
            if name == "browser_close":
                logger.info("mcp_browser_close_completed")
                return "[browser_close completed]"
            raise
        if result.content:
            texts = [c.text for c in result.content if hasattr(c, "text")]
            combined = "\n".join(texts) if texts else str(result.content)
            if name != "browser_snapshot":
                logger.info("mcp_tool_result tool=%s len=%d", name, len(combined))
            return combined
        return ""

    def get_tools_for_llm(self, *, provider: str = "openai_compatible") -> list[dict]:
        """将 MCP 工具转换为 LLM API tools 格式。"""
        if not self._tools_cache:
            raise RuntimeError("Call list_tools() first")
        tools = []
        for t in self._tools_cache:
            schema = t.get("input_schema", {})
            if provider == "anthropic":
                tools.append({
                    "name": t["name"],
                    "description": t["description"][:1024],
                    "input_schema": schema,
                })
            else:
                tools.append({
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"][:1024],
                        "parameters": schema,
                    },
                })
        return tools
