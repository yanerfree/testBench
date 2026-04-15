import uuid
from datetime import datetime

from app.schemas.common import BaseSchema


class UserResponse(BaseSchema):
    """用户响应"""
    id: uuid.UUID
    username: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
