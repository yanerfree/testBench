import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


# ---- 全局变量 ----

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


# ---- 环境 ----

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


# ---- 通知渠道 ----

class CreateChannelRequest(BaseSchema):
    name: str
    webhook_url: str

class UpdateChannelRequest(BaseSchema):
    name: str | None = None
    webhook_url: str | None = None

class ChannelResponse(BaseSchema):
    id: uuid.UUID
    name: str
    webhook_url: str
    created_at: datetime | None = None
