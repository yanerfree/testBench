import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class CreateBranchRequest(BaseSchema):
    """创建分支配置请求"""
    name: str = Field(min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_\-]+$")
    description: str | None = None
    branch: str = Field(default="main", max_length=100)


class UpdateBranchRequest(BaseSchema):
    """更新分支配置请求（name 不可改）"""
    description: str | None = None
    branch: str | None = Field(default=None, max_length=100)


class BranchResponse(BaseSchema):
    """分支配置响应"""
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    branch: str
    status: str
    json_file_path: str
    last_sync_at: datetime | None
    last_commit_sha: str | None
    created_at: datetime
    updated_at: datetime


class SyncBranchResponse(BaseSchema):
    """分支同步响应"""
    commit_sha: str
    first_time: bool
    added: int = 0
    modified: int = 0
    deleted: int = 0
