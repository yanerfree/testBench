from app.schemas.common import BaseSchema
from app.schemas.user import UserResponse


class LoginRequest(BaseSchema):
    """登录请求"""
    username: str
    password: str


class TokenResponse(BaseSchema):
    """登录成功响应"""
    token: str
    refresh_token: str
    user: UserResponse


class RefreshRequest(BaseSchema):
    """刷新令牌请求（前端传 camelCase refreshToken，经 alias 自动映射）"""
    refresh_token: str


class RefreshResponse(BaseSchema):
    """刷新令牌响应"""
    token: str
    refresh_token: str
