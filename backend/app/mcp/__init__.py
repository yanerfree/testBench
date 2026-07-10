"""testBench MCP Server — 暴露平台数据能力，供 Web 引擎和 Claude Code 使用"""
from __future__ import annotations

from fastmcp import FastMCP

from app.mcp.deps import get_mcp_session
from app.mcp.tools import test_cases, api_endpoints, environments, test_reports, api_tests, scenario_gen, projects

mcp = FastMCP(
    name="testBench",
    instructions="testBench 测试管理平台 MCP Server。提供测试用例、API 接口、环境变量等数据操作工具。",
)


def _register(func, name: str, description: str):
    """注册一个 MCP 工具，直接查真实 DB。"""
    import functools
    import inspect

    sig = inspect.signature(func)
    params = list(sig.parameters.keys())
    has_session = "session" in params

    @functools.wraps(func)
    async def wrapper(**kwargs):
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


# ── 接口测试工具 ──────────────────────────────────

_register(
    api_tests.generate_api_test,
    name="tb_generate_api_test",
    description="根据接口定义 AI 生成接口测试场景。参数: branch_id(分支UUID), api_info(接口定义文本，含method/url/参数/响应), folder_name(可选，目标文件夹名)",
)

_register(
    api_tests.list_api_test_scenarios,
    name="tb_list_api_tests",
    description="列出接口测试场景。参数: branch_id(分支UUID), folder_id(可选), status(可选: draft/published/deprecated)",
)

_register(
    api_tests.get_api_test_scenario,
    name="tb_get_api_test",
    description="获取接口测试场景详情（含所有步骤、断言、变量提取）。参数: scenario_id(场景UUID)",
)

_register(
    api_tests.run_api_test,
    name="tb_run_api_test",
    description="执行接口测试场景并返回结果汇总。参数: scenario_ids(逗号分隔的场景UUID列表)",
)


# ── 功能场景测试工具 ──────────────────────────────

_register(
    scenario_gen.create_scenario_task,
    name="tb_create_scenario_task",
    description="创建功能场景测试生成任务。AI 将自动提取需求点、生成场景模型、展开测试用例。参数: project_id(项目UUID), branch_id(分支UUID), title(任务名称), content_markdown(需求文档Markdown内容)",
)

_register(
    scenario_gen.get_scenario_task,
    name="tb_get_scenario_task",
    description="查询功能场景测试生成任务的状态与进度。参数: task_id(任务UUID)",
)

_register(
    scenario_gen.query_coverage_matrix,
    name="tb_query_coverage_matrix",
    description="查询覆盖矩阵：需求点 × 测试维度的覆盖状态。参数: task_id(任务UUID), branch_id(分支UUID)",
)


# ── 项目与分支查询工具 ──────────────────────────────

_register(
    projects.list_projects,
    name="tb_list_projects",
    description="列出所有项目（名称、ID、描述）。用于确定要操作的目标项目。",
)

_register(
    projects.list_branches,
    name="tb_list_branches",
    description="列出项目下所有活跃分支。参数: project_id(项目UUID)",
)

_register(
    scenario_gen.get_generation_stats,
    name="tb_get_generation_stats",
    description="查询 AI 生成质量统计：通过率/拒绝率/总数。参数: branch_id(分支UUID)",
)
