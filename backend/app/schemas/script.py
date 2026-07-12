import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import BaseSchema


class CreateScriptRequest(BaseSchema):
    script_type: Literal["api", "ui"]
    content: str = Field(min_length=1)
    file_name: str | None = None
    func_name: str | None = None
    language: Literal["python", "typescript"] = "python"
    source: Literal["manual", "git_sync", "upload", "ai_generated"] = "manual"


class ScriptResponse(BaseSchema):
    id: uuid.UUID
    case_id: uuid.UUID
    script_type: str
    version: int
    language: str
    content: str
    file_name: str | None
    func_name: str | None
    status: str
    source: str
    commit_sha: str | None
    created_at: datetime
    updated_at: datetime
