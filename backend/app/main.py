from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.exceptions import AppError, app_error_handler, http_exception_handler, unhandled_exception_handler
from app.core.health import router as health_router
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.projects import router as projects_router
from app.api.branches import router as branches_router
from app.api.cases import router as cases_router, folders_router
from app.api.variables import router as variables_router
from app.api.plans import router as plans_router, reports_router
from app.api.tasks import router as tasks_router
from app.api.logs import router as logs_router
from app.api.scripts import router as scripts_router, export_router as scripts_export_router
from app.api.testforge import router as testforge_router
from app.api.debug import router as debug_router
from app.api.api_collections import router as api_collections_router
from app.api.llm_mock import router as llm_mock_router
from app.api.api_mock import router as api_mock_router
from app.api.ai import router as ai_router, config_router as ai_config_router
from app.api.ai_config import router as ai_provider_router, project_router as project_ai_config_router
from app.api.skill_run import router as skill_run_router
from app.api.mcp_mock import router as mcp_mock_router
from app.api.exploratory import router as exploratory_router
from app.api.documents import router as documents_router
from app.api.case_file import router as case_file_router
from app.api.api_test import router as api_test_router
from app.api.skill_manage import router as skill_manage_router
from app.api.knowledge import router as knowledge_router
from app.api.screenshots import router as screenshots_router
from app.api.toolbox import router as toolbox_router
from app.core.middleware import CamelCaseResponse, TokenRefreshMiddleware, TraceIdMiddleware

# --- MCP Server ---
from app.mcp import mcp
_mcp_app = mcp.http_app(path="/")

from contextlib import asynccontextmanager
import logging

_startup_logger = logging.getLogger("mock_startup")

@asynccontextmanager
async def lifespan(app):
    async with _mcp_app.lifespan(app):
        await _restore_mock_services()
        yield


async def _restore_mock_services():
    from app.services.llm_mock_manager import mock_server
    from app.services.api_mock_manager import api_mock_server
    try:
        if mock_server._load_state():
            _startup_logger.info("自动恢复 LLM Mock 服务 (端口 %d)", mock_server.port)
            await mock_server.start()
    except Exception as e:
        _startup_logger.warning("LLM Mock 自动恢复失败: %s", e)
    try:
        if api_mock_server._load_state():
            _startup_logger.info("自动恢复 API Mock 服务 (端口 %d)", api_mock_server.port)
            await api_mock_server.start()
    except Exception as e:
        _startup_logger.warning("API Mock 自动恢复失败: %s", e)

app = FastAPI(
    title="测试管理平台 API",
    default_response_class=CamelCaseResponse,
    lifespan=lifespan,
)

# --- 中间件（注册顺序：后注册先执行） ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TraceIdMiddleware)
app.add_middleware(TokenRefreshMiddleware)

# --- 异常处理器 ---
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# --- 路由 ---
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(branches_router)
app.include_router(cases_router)
app.include_router(folders_router)
app.include_router(variables_router)
app.include_router(plans_router)
app.include_router(reports_router)
app.include_router(tasks_router)
app.include_router(logs_router)
app.include_router(scripts_router)
app.include_router(scripts_export_router)
app.include_router(testforge_router)
app.include_router(debug_router)
app.include_router(api_collections_router)
app.include_router(llm_mock_router)
app.include_router(api_mock_router)
app.include_router(ai_router)
app.include_router(ai_config_router)
app.include_router(ai_provider_router)
app.include_router(project_ai_config_router)
app.include_router(skill_run_router)
app.include_router(mcp_mock_router)
app.include_router(exploratory_router)
app.include_router(documents_router)
app.include_router(api_test_router)
app.include_router(case_file_router)
app.include_router(skill_manage_router)
app.include_router(knowledge_router)
app.include_router(screenshots_router)
app.include_router(toolbox_router)

# --- MCP Server 挂载 ---
app.mount("/mcp", _mcp_app)
