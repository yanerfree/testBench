from fastapi import Request
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse


class AppError(Exception):
    """应用异常基类"""
    def __init__(self, code: str, message: str, status_code: int = 400, detail: str | None = None):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.detail = detail


class NotFoundError(AppError):
    """资源不存在"""
    def __init__(self, code: str = "NOT_FOUND", message: str = "资源不存在", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=404, detail=detail)


class ForbiddenError(AppError):
    """无权限"""
    def __init__(self, code: str = "FORBIDDEN", message: str = "无权限", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=403, detail=detail)


class ConflictError(AppError):
    """冲突"""
    def __init__(self, code: str = "CONFLICT", message: str = "资源冲突", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=409, detail=detail)


class UnauthorizedError(AppError):
    """未认证"""
    def __init__(self, code: str = "UNAUTHORIZED", message: str = "未登录或 token 已过期", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=401, detail=detail)


class ValidationError(AppError):
    """业务规则校验失败"""
    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "业务规则校验失败", detail: str | None = None):
        super().__init__(code=code, message=message, status_code=422, detail=detail)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """AppError 全局处理器"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            }
        },
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """FastAPI HTTPException 全局处理器（兜底，统一格式）"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": exc.detail if isinstance(exc.detail, str) else "请求错误",
                "detail": None,
            }
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """未捕获异常兜底（生产环境不暴露堆栈）"""
    import traceback; traceback.print_exc()  # 打印堆栈便于排查
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "服务内部错误",
                "detail": None,
            }
        },
    )
