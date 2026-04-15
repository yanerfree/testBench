from app.schemas.common import BaseSchema
from app.schemas.user import UserResponse


class LoginRequest(BaseSchema):
    """登录请求"""
    username: str
    password: str


class TokenResponse(BaseSchema):
    """登录成功响应"""
    token: str
    user: UserResponse
