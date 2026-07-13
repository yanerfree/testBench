"""Playwright MCP Bridge — 连接 Playwright MCP Server，调用浏览器工具。

不依赖 LangChain，直接用 MCP SDK 的 ClientSession。
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

MCP_URL = "http://localhost:8931/sse"


class PlaywrightMCPBridge:
    """连接 Playwright MCP SSE Server，暴露浏览器操作工具。"""

    def __init__(self, mcp_url: str = MCP_URL) -> None:
        self._mcp_url = mcp_url
        self._session = None
        self._sse_cm = None
        self._session_cm = None
        self._tools: dict[str, dict] = {}

    async def connect(self) -> None:
        from mcp import ClientSession
        from mcp.client.sse import sse_client

        self._sse_cm = sse_client(self._mcp_url, sse_read_timeout=600)
        read_stream, write_stream = await self._sse_cm.__aenter__()
        self._session_cm = ClientSession(read_stream, write_stream)
        self._session = await self._session_cm.__aenter__()
        await self._session.initialize()

        # 发现所有工具
        result = await self._session.list_tools()
        self._tools = {t.name: {"description": t.description, "schema": t.inputSchema if hasattr(t, "inputSchema") else {}} for t in result.tools}
        logger.info("Playwright MCP connected: %d tools available", len(self._tools))

    async def close(self) -> None:
        try:
            if self._session:
                await self.call_tool("browser_close", {})
        except Exception:
            pass
        if self._session_cm:
            await self._session_cm.__aexit__(None, None, None)
        if self._sse_cm:
            await self._sse_cm.__aexit__(None, None, None)
        self._session = None

    def tool_names(self) -> list[str]:
        return list(self._tools.keys())

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> str:
        """调用一个浏览器工具，返回文本结果。"""
        if not self._session:
            raise RuntimeError("MCP not connected")
        args = {k: v for k, v in (arguments or {}).items() if v is not None}
        result = await self._session.call_tool(name, args)
        if result.content:
            texts = [c.text for c in result.content if hasattr(c, "text")]
            return "\n".join(texts) if texts else str(result.content)
        return ""

    # 常用操作的快捷方法
    async def navigate(self, url: str) -> str:
        return await self.call_tool("browser_navigate", {"url": url})

    async def snapshot(self) -> str:
        return await self.call_tool("browser_snapshot")

    async def click(self, element: str, ref: str | None = None) -> str:
        args = {"element": element}
        if ref:
            args["ref"] = ref
        return await self.call_tool("browser_click", args)

    async def fill(self, element: str, value: str, ref: str | None = None) -> str:
        args = {"element": element, "value": value}
        if ref:
            args["ref"] = ref
        return await self.call_tool("browser_fill", args)

    async def screenshot(self) -> str:
        return await self.call_tool("browser_screenshot")

    async def select_option(self, element: str, values: list[str]) -> str:
        return await self.call_tool("browser_select_option", {"element": element, "values": values})

    async def press_key(self, key: str) -> str:
        return await self.call_tool("browser_press_key", {"key": key})

    async def wait(self, time_ms: int = 1000) -> str:
        return await self.call_tool("browser_wait", {"time": time_ms})
