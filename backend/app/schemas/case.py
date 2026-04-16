import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import BaseSchema


class CreateCaseRequest(BaseSchema):
    """手动创建用例请求"""
    title: str = Field(min_length=1, max_length=200)
    type: Literal["api", "e2e"]
    module: str = Field(min_length=1, max_length=100)
    submodule: str | None = None
    priority: Literal["P0", "P1", "P2", "P3"] = "P2"
    preconditions: str | None = None
    steps: list[dict] = Field(default_factory=list, min_length=1)
    expected_result: str | None = None
    script_ref_file: str | None = None
    script_ref_func: str | None = None
    remark: str | None = None


class UpdateCaseRequest(BaseSchema):
    """更新用例请求（所有字段可选）"""
    title: str | None = Field(default=None, max_length=200)
    type: Literal["api", "e2e"] | None = None
    module: str | None = None
    submodule: str | None = None
    priority: Literal["P0", "P1", "P2", "P3"] | None = None
    preconditions: str | None = None
    steps: list[dict] | None = None
    expected_result: str | None = None
    script_ref_file: str | None = None
    script_ref_func: str | None = None
    is_flaky: bool | None = None
    remark: str | None = None


class CaseResponse(BaseSchema):
    """用例响应"""
    id: uuid.UUID
    branch_id: uuid.UUID
    case_code: str
    tea_id: str | None
    title: str
    type: str
    folder_id: uuid.UUID | None
    priority: str
    preconditions: str | None
    steps: list[dict]
    expected_result: str | None
    automation_status: str
    source: str
    script_ref_file: str | None
    script_ref_func: str | None
    is_flaky: bool
    remark: str | None
    created_at: datetime
    updated_at: datetime
