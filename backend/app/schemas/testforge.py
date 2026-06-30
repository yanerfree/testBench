from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.common import BaseSchema


class TargetInfo(BaseSchema):
    module: str
    submodule: str | None = None
    script_dir: str | None = None


class CreateTaskRequest(BaseSchema):
    target: TargetInfo
    interface_info: str = Field(description="curl 命令或接口描述原始文本")
    business_rules: list[str] = Field(default_factory=list)


class TaskResponse(BaseSchema):
    task_id: str
    created_at: datetime
    status: str
    platform: dict[str, Any]
    target: dict[str, Any]
    interface_info: str
    business_rules: list[str]
