"""MCP Mock — 模拟 MCP 工具返回数据，不查真实数据库"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp-mock", tags=["mcp-mock"])

_CONFIG_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "mcp-mock-config.json"

MOCK_DATA = {
    "tb_list_cases": {
        "cases": [
            {"id": "mock-001", "caseCode": "TC-DEMO-00001", "title": "用户登录-正常流程", "type": "api", "priority": "P0", "folderId": None, "preconditions": "用户已注册", "steps": [{"action": "POST /api/auth/login {username, password}", "expected": "返回 200 + token"}], "expectedResult": "登录成功，返回 JWT", "automationStatus": "pending", "source": "mock"},
            {"id": "mock-002", "caseCode": "TC-DEMO-00002", "title": "用户登录-密码错误", "type": "api", "priority": "P1", "folderId": None, "preconditions": "用户已注册", "steps": [{"action": "POST /api/auth/login {username, wrongPassword}", "expected": "返回 401"}], "expectedResult": "登录失败，返回错误提示", "automationStatus": "pending", "source": "mock"},
        ],
        "total": 2, "page": 1, "pageSize": 50,
    },
    "tb_get_case": {
        "id": "mock-001", "caseCode": "TC-DEMO-00001", "title": "用户登录-正常流程", "type": "api", "priority": "P0",
        "preconditions": "用户已注册", "steps": [{"action": "POST /api/auth/login", "expected": "返回 200"}],
        "expectedResult": "登录成功", "automationStatus": "pending", "source": "mock",
    },
    "tb_create_case": {
        "id": "mock-new", "caseCode": "TC-MOCK-00001", "title": "(mock) 新建的用例", "type": "api", "priority": "P2",
        "source": "mock",
    },
    "tb_get_folder_tree": [
        {"id": "folder-1", "name": "用户管理", "path": "/用户管理", "depth": 1, "caseCount": 5, "children": [
            {"id": "folder-2", "name": "登录", "path": "/用户管理/登录", "depth": 2, "caseCount": 3, "children": []},
        ]},
        {"id": "folder-3", "name": "项目管理", "path": "/项目管理", "depth": 1, "caseCount": 8, "children": []},
    ],
    "tb_list_api_tree": [
        {"id": "api-1", "type": "folder", "name": "用户模块", "method": None, "url": None, "parentId": None},
        {"id": "api-2", "type": "endpoint", "name": "用户登录", "method": "POST", "url": "/api/auth/login", "parentId": "api-1", "headers": {"Content-Type": "application/json"}, "body": {"username": "string", "password": "string"}},
        {"id": "api-3", "type": "endpoint", "name": "获取用户列表", "method": "GET", "url": "/api/users", "parentId": "api-1"},
    ],
    "tb_get_api_node": {
        "id": "api-2", "type": "endpoint", "name": "用户登录", "method": "POST", "url": "/api/auth/login",
        "headers": {"Content-Type": "application/json"},
        "body": {"username": "string", "password": "string"},
        "description": "用户登录接口，返回 JWT token",
    },
    "tb_list_environments": [
        {"id": "env-1", "name": "development", "description": "开发环境"},
        {"id": "env-2", "name": "staging", "description": "预发布环境"},
        {"id": "env-3", "name": "production", "description": "生产环境"},
    ],
    "tb_get_merged_variables": {
        "BASE_URL": "http://localhost:8000",
        "AUTH_TOKEN": "mock-jwt-token-xxx",
        "DB_HOST": "localhost",
    },
}

_enabled = False


def is_enabled() -> bool:
    return _enabled


def get_mock_response(tool_name: str) -> dict | list | None:
    if not _enabled:
        return None
    return MOCK_DATA.get(tool_name)


class MockConfig(BaseModel):
    enabled: bool


@router.get("/config")
async def get_config():
    return {"data": {"enabled": _enabled, "tools": list(MOCK_DATA.keys())}}


@router.put("/config")
async def update_config(body: MockConfig):
    global _enabled
    _enabled = body.enabled
    logger.info("MCP Mock %s", "enabled" if _enabled else "disabled")
    return {"data": {"enabled": _enabled}}


@router.get("/preview/{tool_name}")
async def preview_mock_data(tool_name: str):
    data = MOCK_DATA.get(tool_name)
    if data is None:
        return {"data": None, "error": f"工具 {tool_name} 无模拟数据"}
    return {"data": data}
