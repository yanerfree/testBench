import time
import uuid
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def _to_camel(name: str) -> str:
    """snake_case -> camelCase"""
    components = name.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


def to_camel_case(data: Any) -> Any:
    """递归将 dict key 从 snake_case 转为 camelCase"""
    if isinstance(data, dict):
        return {_to_camel(k): to_camel_case(v) for k, v in data.items()}
    if isinstance(data, list):
        return [to_camel_case(item) for item in data]
    return data


class CamelCaseResponse(JSONResponse):
    """自动将响应 body 中的 snake_case key 转为 camelCase"""
    def render(self, content: Any) -> bytes:
        return super().render(to_camel_case(content))


class TraceIdMiddleware(BaseHTTPMiddleware):
    """为每个请求生成唯一 trace_id，注入到 request.state 和 response header"""
    async def dispatch(self, request: Request, call_next):
        trace_id = request.headers.get("X-Trace-Id") or str(uuid.uuid4())
        request.state.trace_id = trace_id
        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id
        return response


class TokenRefreshMiddleware(BaseHTTPMiddleware):
    """JWT 滑动续期：token 剩余有效期 < 2h 时，在 response header 返回 X-New-Token"""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return response

        token = auth_header[7:]
        try:
            from app.core.security import decode_token, create_access_token
            claims = decode_token(token)
            exp = claims.get("exp", 0)
            remaining = exp - int(time.time())
            if 0 < remaining < 7200:  # 剩余不足 2 小时
                new_token = create_access_token(
                    user_id=uuid.UUID(claims["sub"]),
                    role=claims["role"],
                )
                response.headers["X-New-Token"] = new_token
        except Exception:
            pass  # token 无效时不阻断正常响应

        return response
