"""MCP Mock 服务 — 可配置每个工具的响应（成功/失败/自定义），供外部 MCP 客户端测试用"""
from __future__ import annotations

import copy
import json
import logging
import time
import uuid
from collections import deque
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp-mock", tags=["mcp-mock"])


# ── 默认模拟数据 ──────────────────────────────────

DEFAULT_SUCCESS = {
    "tb_list_cases": {
        "cases": [
            {"id": "mock-001", "caseCode": "TC-DEMO-00001", "title": "用户登录-正常流程", "type": "api", "priority": "P0", "preconditions": "用户已注册", "steps": [{"action": "POST /api/auth/login {username, password}", "expected": "返回 200 + token"}], "expectedResult": "登录成功"},
            {"id": "mock-002", "caseCode": "TC-DEMO-00002", "title": "用户登录-密码错误", "type": "api", "priority": "P1", "preconditions": "用户已注册", "steps": [{"action": "POST /api/auth/login {username, wrong}", "expected": "返回 401"}], "expectedResult": "登录失败"},
        ],
        "total": 2, "page": 1, "pageSize": 50,
    },
    "tb_get_case": {"id": "mock-001", "caseCode": "TC-DEMO-00001", "title": "用户登录-正常流程", "type": "api", "priority": "P0", "steps": [{"action": "POST /api/auth/login", "expected": "返回 200"}]},
    "tb_create_case": {"id": "mock-new", "caseCode": "TC-MOCK-00001", "title": "(mock) 新建的用例", "type": "api", "priority": "P2"},
    "tb_get_folder_tree": [
        {"id": "folder-1", "name": "用户管理", "depth": 1, "caseCount": 5, "children": [{"id": "folder-2", "name": "登录", "depth": 2, "caseCount": 3, "children": []}]},
        {"id": "folder-3", "name": "项目管理", "depth": 1, "caseCount": 8, "children": []},
    ],
    "tb_list_api_tree": [
        {"id": "api-1", "type": "folder", "name": "用户模块", "method": None, "url": None},
        {"id": "api-2", "type": "endpoint", "name": "用户登录", "method": "POST", "url": "/api/auth/login", "headers": {"Content-Type": "application/json"}, "body": {"username": "string", "password": "string"}},
        {"id": "api-3", "type": "endpoint", "name": "获取用户列表", "method": "GET", "url": "/api/users"},
    ],
    "tb_get_api_node": {"id": "api-2", "type": "endpoint", "name": "用户登录", "method": "POST", "url": "/api/auth/login", "headers": {"Content-Type": "application/json"}, "body": {"username": "string", "password": "string"}},
    "tb_list_environments": [{"id": "env-1", "name": "development", "description": "开发环境"}, {"id": "env-2", "name": "staging", "description": "预发布环境"}, {"id": "env-3", "name": "production", "description": "生产环境"}],
    "tb_get_merged_variables": {"BASE_URL": "http://localhost:8000", "AUTH_TOKEN": "mock-jwt-xxx", "DB_HOST": "localhost"},
}

DEFAULT_ERROR = {"error": "Mock error: tool call failed", "code": "MOCK_ERROR"}

TOOL_DESCRIPTIONS = {
    "tb_list_cases": "列出测试用例",
    "tb_get_case": "获取用例详情",
    "tb_create_case": "创建测试用例",
    "tb_get_folder_tree": "获取文件夹树",
    "tb_list_api_tree": "获取 API 接口树",
    "tb_get_api_node": "获取 API 节点详情",
    "tb_list_environments": "列出测试环境",
    "tb_get_merged_variables": "获取合并变量",
}


# ── 运行时状态（内存） ──────────────────────────────

class ToolMockConfig:
    def __init__(self):
        self.enabled = False
        self.tools: dict[str, dict] = {}
        for name in DEFAULT_SUCCESS:
            self.tools[name] = {
                "mode": "success",  # success | error | custom
                "customData": None,
                "customIsError": False,
                "errorMessage": "Mock error: tool call failed",
            }

_config = ToolMockConfig()
_call_logs: deque[dict] = deque(maxlen=500)


def is_enabled() -> bool:
    return _config.enabled


def get_mock_response(tool_name: str):
    """MCP 工具 wrapper 调用。返回 None 表示不 mock，返回带 error+code 的 dict 表示错误。"""
    if not _config.enabled:
        return None
    return _compute_mock_response(tool_name)


def get_mock_response_always(tool_name: str):
    """独立 Mock MCP Server（/mcp-mock-server/）使用 — 不受全局开关影响，始终返回配置的模拟响应并记录日志。"""
    t0 = time.perf_counter()
    result = _compute_mock_response(tool_name)
    tool_cfg = _config.tools.get(tool_name) or {}
    is_error = isinstance(result, dict) and result.get("code") in ("MOCK_ERROR", "MOCK_CUSTOM_ERROR")
    _log_call(tool_name, {}, result, "mock-server", tool_cfg.get("mode", "success"), is_error, t0)
    return result


def _compute_mock_response(tool_name: str):
    tool_cfg = _config.tools.get(tool_name)
    if not tool_cfg:
        return None

    mode = tool_cfg["mode"]
    if mode == "success":
        return DEFAULT_SUCCESS.get(tool_name, {"result": "ok"})
    elif mode == "error":
        return {"error": tool_cfg.get("errorMessage", "Mock error"), "code": "MOCK_ERROR"}
    elif mode == "custom":
        data = tool_cfg.get("customData") or DEFAULT_SUCCESS.get(tool_name)
        if tool_cfg.get("customIsError"):
            msg = data.get("error", str(data)) if isinstance(data, dict) else str(data)
            return {"error": msg, "code": "MOCK_CUSTOM_ERROR"}
        return data
    return None


# ── API ──────────────────────────────────────────

class GlobalConfig(BaseModel):
    enabled: bool


class ToolConfig(BaseModel):
    mode: str = Field(..., pattern="^(success|error|custom)$")
    custom_data: dict | list | None = None
    custom_is_error: bool | None = None
    error_message: str | None = None


@router.get("/config")
async def get_config():
    tools = []
    for name, cfg in _config.tools.items():
        tools.append({
            "name": name,
            "description": TOOL_DESCRIPTIONS.get(name, ""),
            "mode": cfg["mode"],
            "errorMessage": cfg.get("errorMessage", ""),
            "hasCustomData": cfg.get("customData") is not None,
        })
    return {"data": {"enabled": _config.enabled, "tools": tools}}


@router.put("/config")
async def update_global_config(body: GlobalConfig):
    _config.enabled = body.enabled
    logger.info("MCP Mock %s", "enabled" if body.enabled else "disabled")
    return {"data": {"enabled": _config.enabled}}


@router.put("/tools/{tool_name}")
async def update_tool_config(tool_name: str, body: ToolConfig):
    if tool_name not in _config.tools:
        return {"error": f"工具 {tool_name} 不存在"}
    _config.tools[tool_name]["mode"] = body.mode
    if body.custom_data is not None:
        _config.tools[tool_name]["customData"] = body.custom_data
    if body.custom_is_error is not None:
        _config.tools[tool_name]["customIsError"] = body.custom_is_error
    if body.error_message is not None:
        _config.tools[tool_name]["errorMessage"] = body.error_message
    return {"data": {"name": tool_name, "mode": body.mode}}


@router.get("/preview/{tool_name}")
async def preview_tool_response(tool_name: str):
    if tool_name not in _config.tools:
        return {"data": None, "error": f"工具 {tool_name} 不存在"}
    response = get_mock_response(tool_name) if _config.enabled else DEFAULT_SUCCESS.get(tool_name)
    mode = _config.tools[tool_name]["mode"]
    return {"data": response, "mode": mode, "enabled": _config.enabled}


@router.post("/call")
async def call_tool(body: dict):
    """调用 MCP 工具 — mock 开启时返回配置的响应，关闭时查真实 DB。"""
    tool_name = body.get("tool", "")
    arguments = body.get("arguments", {})
    t0 = time.perf_counter()

    if tool_name not in TOOL_DESCRIPTIONS:
        return {"data": None, "error": f"工具 {tool_name} 不存在", "available": list(TOOL_DESCRIPTIONS.keys())}

    if _config.enabled:
        response = get_mock_response(tool_name)
        mode = _config.tools[tool_name]["mode"]
        is_error = mode == "error" or (_config.tools[tool_name].get("customIsError") and mode == "custom")
        _log_call(tool_name, arguments, response, "mock", mode, is_error, t0)
        return {"data": response, "source": "mock", "mode": mode, "tool": tool_name}

    from app.mcp.tools import test_cases, api_endpoints, environments
    from app.mcp.deps import get_mcp_session
    import inspect

    TOOL_MAP = {
        "tb_list_cases": test_cases.list_cases,
        "tb_get_case": test_cases.get_case,
        "tb_create_case": test_cases.create_case,
        "tb_get_folder_tree": test_cases.get_folder_tree,
        "tb_list_api_tree": api_endpoints.list_api_tree,
        "tb_get_api_node": api_endpoints.get_api_node,
        "tb_list_environments": environments.list_environments,
        "tb_get_merged_variables": environments.get_merged_variables,
    }

    func = TOOL_MAP.get(tool_name)
    if not func:
        return {"data": None, "error": f"工具 {tool_name} 无法直接调用"}

    try:
        sig = inspect.signature(func)
        if "session" in sig.parameters:
            async with get_mcp_session() as session:
                result = await func(session=session, **arguments)
        else:
            result = await func(**arguments)
        _log_call(tool_name, arguments, result, "real", "real", False, t0)
        return {"data": result, "source": "real", "tool": tool_name}
    except Exception as e:
        _log_call(tool_name, arguments, {"error": str(e)[:300]}, "real", "real", True, t0)
        return {"data": None, "error": str(e)[:300], "tool": tool_name}


def _log_call(tool_name, arguments, response, source, mode, is_error, t0):
    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    resp_str = json.dumps(response, ensure_ascii=False, default=str)
    _call_logs.appendleft({
        "id": str(uuid.uuid4())[:8],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tool": tool_name,
        "arguments": arguments,
        "response": resp_str[:5000],
        "source": source,
        "mode": mode,
        "isError": is_error,
        "elapsedMs": elapsed,
    })


# ── 日志查询 ──

@router.get("/logs")
async def get_logs(
    tool: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    logs = list(_call_logs)
    if tool:
        logs = [l for l in logs if l["tool"] == tool]
    if status == "ok":
        logs = [l for l in logs if not l["isError"]]
    elif status == "error":
        logs = [l for l in logs if l["isError"]]
    total = len(logs)
    return {"data": logs[offset:offset + limit], "total": total}


@router.delete("/logs")
async def clear_logs():
    count = len(_call_logs)
    _call_logs.clear()
    return {"ok": True, "deleted": count}
