"""Playwright MCP Bridge — 连接 Playwright MCP Server，暴露为 LangChain StructuredTool。

参考 ThemisAI mcp_bridge.py，支持 stdio（本地启动）和 SSE（长驻服务）两种模式。
"""
from __future__ import annotations

import logging
import os
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from langchain_core.tools import StructuredTool
    from mcp import ClientSession

logger = logging.getLogger(__name__)

MCP_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "playwright-mcp-config.json",
)


class PlaywrightMCPBridge:
    """连接 Playwright MCP Server，暴露浏览器工具。"""

    def __init__(self, *, headless: bool = True, config_path: str | None = None) -> None:
        self._headless = headless
        self._config_path = config_path or MCP_CONFIG_PATH
        self._session: ClientSession | None = None
        self._stdio_cm: Any = None
        self._session_cm: Any = None
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

    async def list_mcp_tools(self) -> list[dict]:
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

    async def as_langchain_tools(self) -> list[StructuredTool]:
        """将 MCP 工具转换为 LangChain StructuredTool 列表。"""
        from langchain_core.tools import StructuredTool
        from pydantic import Field, create_model

        mcp_tools = await self.list_mcp_tools()
        langchain_tools = []

        for tool_def in mcp_tools:
            tool_name = tool_def["name"]

            def _make_fn(name: str):
                async def _call(**kwargs: Any) -> str:
                    return await self.call_tool(name, kwargs)
                return _call

            schema = tool_def.get("input_schema", {})
            properties = schema.get("properties", {})
            required = set(schema.get("required", []))

            fields: dict[str, Any] = {}
            for prop_name, prop_def in properties.items():
                py_type = _json_schema_to_python_type(prop_def)
                desc = prop_def.get("description", "")
                if prop_name in required:
                    fields[prop_name] = (py_type, Field(description=desc))
                else:
                    fields[prop_name] = (py_type | None, Field(default=None, description=desc))

            args_model = create_model(f"{tool_name}_args", **fields) if fields else None

            lc_tool = StructuredTool.from_function(
                coroutine=_make_fn(tool_name),
                name=tool_name,
                description=tool_def["description"][:1024] if tool_def["description"] else tool_name,
                args_schema=args_model,
            )
            langchain_tools.append(lc_tool)

        logger.info("playwright_langchain_tools_loaded count=%d", len(langchain_tools))
        return langchain_tools


def _json_schema_to_python_type(prop_def: dict) -> type:
    json_type = prop_def.get("type", "string")
    if json_type == "array":
        items = prop_def.get("items", {})
        item_type = _json_schema_to_python_type(items)
        return list[item_type]  # type: ignore[valid-type]
    if json_type == "object":
        return dict[str, Any]
    type_map = {"string": str, "integer": int, "number": float, "boolean": bool}
    return type_map.get(json_type, str)
