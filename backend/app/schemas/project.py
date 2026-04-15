import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class CreateProjectRequest(BaseSchema):
    """创建项目请求"""
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    git_url: str = Field(max_length=500, pattern=r"^(git@|https://)")
    script_base_path: str = Field(max_length=500)


class UpdateProjectRequest(BaseSchema):
    """更新项目请求（所有字段可选）"""
    description: str | None = None
    git_url: str | None = Field(default=None, max_length=500, pattern=r"^(git@|https://)")
    script_base_path: str | None = Field(default=None, max_length=500)


class ProjectResponse(BaseSchema):
    """项目响应"""
    id: uuid.UUID
    name: str
    description: str | None
    git_url: str
    script_base_path: str
    created_at: datetime
    updated_at: datetime
