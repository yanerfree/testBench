from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.deps.auth import get_current_user
from app.deps.db import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import MessageResponse
from app.schemas.user import UserResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(body: LoginRequest, session: AsyncSession = Depends(get_db)):
    """用户名 + 密码登录，返回 JWT token"""
    user = await auth_service.authenticate(session, body.username, body.password)
    token = create_access_token(user.id, user.role)
    return {
        "data": TokenResponse(
            token=token,
            user=UserResponse.model_validate(user, from_attributes=True),
        ).model_dump(by_alias=True)
    }


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return {
        "data": UserResponse.model_validate(current_user, from_attributes=True).model_dump(by_alias=True)
    }


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    """登出（前端清除 token，后端仅返回确认）"""
    return MessageResponse(message="登出成功").model_dump()
