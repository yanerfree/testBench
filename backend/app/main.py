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
from app.core.middleware import CamelCaseResponse, TokenRefreshMiddleware, TraceIdMiddleware

app = FastAPI(
    title="测试管理平台 API",
    default_response_class=CamelCaseResponse,
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
