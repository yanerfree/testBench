"""全局变量 + 环境 + 通知渠道 API"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.status import HTTP_201_CREATED

from app.deps.auth import get_current_user
from app.deps.db import get_db
from app.models.user import User
from app.schemas.common import BaseSchema, MessageResponse
from app.services import channel_service, environment_service, variable_service

router = APIRouter(tags=["variables"])


# ---- Schema ----

class CreateVarRequest(BaseSchema):
    key: str
    value: str
    description: str | None = None

class UpdateVarRequest(BaseSchema):
    value: str
    description: str | None = None

class VarResponse(BaseSchema):
    id: uuid.UUID
    key: str
    value: str
    description: str | None
    sort_order: int


# ---- 全局变量 API ----

@router.get("/api/global-variables")
async def list_global_variables(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """全局变量列表"""
    variables = await variable_service.list_variables(session)
    return {
        "data": [VarResponse.model_validate(v, from_attributes=True).model_dump(by_alias=True) for v in variables]
    }


@router.post("/api/global-variables", status_code=HTTP_201_CREATED)
async def create_global_variable(
    body: CreateVarRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """创建全局变量"""
    var = await variable_service.create_variable(session, body.key, body.value, body.description)
    return {"data": VarResponse.model_validate(var, from_attributes=True).model_dump(by_alias=True)}


@router.put("/api/global-variables")
async def put_global_variables(
    body: list[CreateVarRequest],
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """全量替换全局变量（一次请求保存所有变量）"""
    variables = await variable_service.put_variables(session, [v.model_dump() for v in body])
    return {"data": [VarResponse.model_validate(v, from_attributes=True).model_dump(by_alias=True) for v in variables]}


@router.put("/api/global-variables/{var_id}")
async def update_global_variable(
    var_id: uuid.UUID,
    body: UpdateVarRequest,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """更新全局变量"""
    var = await variable_service.update_variable(session, var_id, body.value, body.description)
    return {"data": VarResponse.model_validate(var, from_attributes=True).model_dump(by_alias=True)}


@router.delete("/api/global-variables/{var_id}")
async def delete_global_variable(
    var_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """删除全局变量"""
    await variable_service.delete_variable(session, var_id)
    return MessageResponse(message="删除成功").model_dump()


# ---- 环境 Schema ----

class CreateEnvRequest(BaseSchema):
    name: str
    description: str | None = None

class EnvResponse(BaseSchema):
    id: uuid.UUID
    name: str
    description: str | None

class EnvVarItem(BaseSchema):
    key: str
    value: str
    description: str | None = None

class EnvVarResponse(BaseSchema):
    id: uuid.UUID
    key: str
    value: str
    description: str | None
    sort_order: int

class CloneEnvRequest(BaseSchema):
    name: str


# ---- 环境 API ----

@router.get("/api/environments")
async def list_environments(session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    envs = await environment_service.list_environments(session)
    return {"data": [EnvResponse.model_validate(e, from_attributes=True).model_dump(by_alias=True) for e in envs]}

@router.post("/api/environments", status_code=HTTP_201_CREATED)
async def create_environment(body: CreateEnvRequest, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    env = await environment_service.create_environment(session, body.name, body.description)
    return {"data": EnvResponse.model_validate(env, from_attributes=True).model_dump(by_alias=True)}

@router.delete("/api/environments/{env_id}")
async def delete_environment(env_id: uuid.UUID, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await environment_service.delete_environment(session, env_id)
    return MessageResponse(message="删除成功").model_dump()

@router.get("/api/environments/{env_id}/variables")
async def list_env_variables(env_id: uuid.UUID, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    variables = await environment_service.list_env_variables(session, env_id)
    return {"data": [EnvVarResponse.model_validate(v, from_attributes=True).model_dump(by_alias=True) for v in variables]}

@router.put("/api/environments/{env_id}/variables")
async def put_env_variables(env_id: uuid.UUID, body: list[EnvVarItem], session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    variables = await environment_service.put_env_variables(session, env_id, [v.model_dump() for v in body])
    return {"data": [EnvVarResponse.model_validate(v, from_attributes=True).model_dump(by_alias=True) for v in variables]}

@router.get("/api/environments/{env_id}/merged-variables")
async def get_merged_variables(env_id: uuid.UUID, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    merged = await environment_service.get_merged_variables(session, env_id)
    return {"data": merged}

@router.post("/api/environments/{env_id}/clone", status_code=HTTP_201_CREATED)
async def clone_environment(env_id: uuid.UUID, body: CloneEnvRequest, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    env = await environment_service.clone_environment(session, env_id, body.name)
    return {"data": EnvResponse.model_validate(env, from_attributes=True).model_dump(by_alias=True)}


# ---- 通知渠道 Schema ----

class CreateChannelRequest(BaseSchema):
    name: str
    webhook_url: str

class UpdateChannelRequest(BaseSchema):
    name: str | None = None
    webhook_url: str | None = None

class ChannelResponse(BaseSchema):
    id: uuid.UUID
    name: str
    webhook_url: str  # 一期明文，二期 AES-256 加密 + 前端遮罩


# ---- 通知渠道 API ----

@router.get("/api/channels")
async def list_channels(session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    channels = await channel_service.list_channels(session)
    return {"data": [ChannelResponse.model_validate(c, from_attributes=True).model_dump(by_alias=True) for c in channels]}

@router.post("/api/channels", status_code=HTTP_201_CREATED)
async def create_channel(body: CreateChannelRequest, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ch = await channel_service.create_channel(session, body.name, body.webhook_url)
    return {"data": ChannelResponse.model_validate(ch, from_attributes=True).model_dump(by_alias=True)}

@router.put("/api/channels/{ch_id}")
async def update_channel(ch_id: uuid.UUID, body: UpdateChannelRequest, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ch = await channel_service.update_channel(session, ch_id, body.name, body.webhook_url)
    return {"data": ChannelResponse.model_validate(ch, from_attributes=True).model_dump(by_alias=True)}

@router.delete("/api/channels/{ch_id}")
async def delete_channel(ch_id: uuid.UUID, session: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await channel_service.delete_channel(session, ch_id)
    return MessageResponse(message="删除成功").model_dump()
