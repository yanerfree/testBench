from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import write_audit_log
from app.core.exceptions import ValidationError
from app.core.security import create_access_token, hash_password, verify_password
from app.deps.auth import get_current_user
from app.deps.db import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import BaseSchema, MessageResponse
from app.schemas.user import UserResponse
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ChangePasswordRequest(BaseSchema):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


@router.post("/login")
async def login(body: LoginRequest, session: AsyncSession = Depends(get_db)):
    """用户名 + 密码登录，返回 JWT token"""
    user = await auth_service.authenticate(session, body.username, body.password)
    token = create_access_token(user.id, user.role)
    await write_audit_log(
        session, action="login", target_type="user",
        target_id=user.id, target_name=user.username,
        user_id=user.id,
    )
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


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """修改当前用户密码"""
    if not verify_password(body.old_password, current_user.password):
        raise ValidationError(code="WRONG_PASSWORD", message="原密码错误")
    current_user.password = hash_password(body.new_password)
    await session.flush()
    await write_audit_log(
        session, action="change_password", target_type="user",
        target_id=current_user.id, target_name=current_user.username,
        user_id=current_user.id,
    )
    return MessageResponse(message="密码修改成功").model_dump()


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """登出（前端清除 token，后端记录审计日志）"""
    await write_audit_log(
        session, action="logout", target_type="user",
        target_id=current_user.id, target_name=current_user.username,
        user_id=current_user.id,
    )
    return MessageResponse(message="登出成功").model_dump()
