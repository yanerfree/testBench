"""testBench MCP Server — 暴露平台数据能力，供 Web 引擎和 Claude Code 使用"""
from __future__ import annotations

from fastmcp import FastMCP

from app.mcp.deps import get_mcp_session
from app.mcp.tools import test_cases, api_endpoints, environments, test_reports

mcp = FastMCP(
    name="testBench",
    instructions="testBench 测试管理平台 MCP Server。提供测试用例、API 接口、环境变量等数据操作工具。",
)


def _register(func, name: str, description: str):
    """注册一个 MCP 工具。mock 模式返回模拟数据，否则查真实 DB。"""
    import functools
    import inspect

    sig = inspect.signature(func)
    params = list(sig.parameters.keys())
    has_session = "session" in params

    @functools.wraps(func)
    async def wrapper(**kwargs):
        from app.api.mcp_mock import is_enabled as mock_enabled, get_mock_response
        if mock_enabled():
            result = get_mock_response(name)
            if isinstance(result, dict) and "error" in result and "code" in result:
                raise RuntimeError(result["error"])
            return result
        if has_session:
            async with get_mcp_session() as session:
                return await func(session=session, **kwargs)
        return await func(**kwargs)

    wrapper.__doc__ = description
    new_params = [p for p in sig.parameters.values() if p.name != "session"]
    wrapper.__signature__ = sig.replace(parameters=new_params)

    mcp.tool(name=name)(wrapper)


# ── 测试用例工具 ─────────────────────────────────

_register(
    test_cases.list_cases,
    name="tb_list_cases",
    description="列出分支下的测试用例，支持分页和筛选。参数: branch_id(分支UUID), page, page_size, keyword, folder_id, priority(P0/P1/P2/P3), case_type(api/e2e)",
)

_register(
    test_cases.get_case,
    name="tb_get_case",
    description="获取单条测试用例的完整详情。参数: case_id(用例UUID)",
)

_register(
    test_cases.create_case,
    name="tb_create_case",
    description="创建一条测试用例，自动生成编号和目录。参数: branch_id, title, module, case_type(api/e2e), submodule, priority(P0-P3), preconditions, steps([{action,expected}]), expected_result",
)

_register(
    test_cases.get_folder_tree,
    name="tb_get_folder_tree",
    description="获取用例文件夹树形结构，含每层用例数量。参数: branch_id(分支UUID)",
)


# ── API 接口工具 ──────────────────────────────────

_register(
    api_endpoints.list_api_tree,
    name="tb_list_api_tree",
    description="获取项目下所有 API 接口的树形结构（文件夹和端点）。参数: project_id(项目UUID)",
)

_register(
    api_endpoints.get_api_node,
    name="tb_get_api_node",
    description="获取单个 API 节点详情（含 method, url, headers, body, auth 等）。参数: node_id(节点UUID)",
)


# ── 环境变量工具 ──────────────────────────────────

_register(
    environments.list_environments,
    name="tb_list_environments",
    description="列出所有测试环境。",
)

_register(
    environments.get_merged_variables,
    name="tb_get_merged_variables",
    description="获取合并后的变量（全局变量 + 环境变量，环境优先）。参数: env_id(环境UUID)",
)


# ── 测试报告工具 ──────────────────────────────────

_register(
    test_reports.get_report_summary,
    name="tb_get_report_summary",
    description="获取测试报告摘要（通过/失败/跳过/通过率 + 模块级分布）。参数: plan_id, report_id(可选)",
)

_register(
    test_reports.get_failed_scenarios,
    name="tb_get_failed_scenarios",
    description="获取报告中失败的用例（含步骤、错误信息）。参数: plan_id, report_id(可选)",
)
