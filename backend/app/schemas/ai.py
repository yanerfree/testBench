from __future__ import annotations

from pydantic import Field

from app.schemas.common import BaseSchema


class TargetInfo(BaseSchema):
    module: str
    submodule: str | None = None


class GenerateCasesRequest(BaseSchema):
    target: TargetInfo
    interface_info: str = Field(description="curl 命令或接口描述")
    business_rules: list[str] = Field(default_factory=list)
    model: str | None = Field(default=None, description="模型覆盖")
    temperature: float | None = Field(default=None, ge=0, le=2)


class GenerateScriptRequest(BaseSchema):
    case_ids: list[str] = Field(min_length=1)
    script_type: str = Field(default="api", pattern="^(api|ui)$")
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)


class GenerateDocRequest(BaseSchema):
    case_ids: list[str] = Field(default_factory=list)
    plan_id: str | None = None
    doc_type: str = Field(default="operation_guide", pattern="^(operation_guide|test_report)$")
    model: str | None = None


class ApplyCasesRequest(BaseSchema):
    cases: list[dict] = Field(min_length=1, description="AI 生成的用例列表")
    folder_id: str | None = Field(default=None, description="目标文件夹 ID")


class AIConfigResponse(BaseSchema):
    enabled: bool
    provider: str
    model: str
    base_url_masked: str
