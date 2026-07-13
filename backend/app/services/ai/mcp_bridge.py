"""Playwright MCP Bridge — 连接 Playwright MCP Server，调用浏览器工具。

MCP Server 会在首次连接时自动启动，不需要手动管理。
"""
from __future__ import annotations

import logging
import subprocess
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MCP_URL = "http://localhost:8931/sse"
MCP_PORT = 8931
_mcp_process = None


def _ensure_mcp_server():
    """确保 MCP Server 正在运行，没有则自动启动"""
    global _mcp_process

    # 检查是否已运行
    try:
        resp = httpx.get(f"http://localhost:{MCP_PORT}/sse", timeout=2)
        if resp.status_code == 200:
            return True
    except Exception:
        pass

    # 启动 MCP Server
    logger.info("Starting Playwright MCP Server on port %d...", MCP_PORT)
    try:
        import os as _os
        config_path = _os.path.join(_os.path.dirname(_os.path.dirname(_os.path.dirname(_os.path.dirname(__file__)))), "playwright-mcp-config.json")
        cmd = ["npx", "@playwright/mcp", "--port", str(MCP_PORT), "--headless", "--browser", "chromium", "--allowed-hosts", "*", "--ignore-https-errors"]
        if _os.path.exists(config_path):
            cmd.extend(["--config", config_path])
        _mcp_process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # 等待启动
        for _ in range(15):
            time.sleep(1)
            try:
                resp = httpx.get(f"http://localhost:{MCP_PORT}/sse", timeout=2)
                if resp.status_code == 200:
                    logger.info("Playwright MCP Server started (PID %d)", _mcp_process.pid)
                    return True
            except Exception:
                pass
        logger.error("Playwright MCP Server failed to start")
        return False
    except Exception as e:
        logger.error("Failed to start MCP Server: %s", e)
        return False


class PlaywrightMCPBridge:
    """连接 Playwright MCP SSE Server，暴露浏览器操作工具。"""

    def __init__(self, mcp_url: str = MCP_URL) -> None:
        self._mcp_url = mcp_url
        self._session = None
        self._sse_cm = None
        self._session_cm = None
        self._tools: dict[str, dict] = {}

    async def connect(self) -> None:
        # 确保 MCP Server 在运行
        _ensure_mcp_server()

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
        try:
            if self._session_cm:
                await self._session_cm.__aexit__(None, None, None)
        except Exception:
            pass
        try:
            if self._sse_cm:
                await self._sse_cm.__aexit__(None, None, None)
        except Exception:
            pass
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
