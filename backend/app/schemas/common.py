from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """所有 schema 的基类，支持 camelCase 请求体自动转 snake_case"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class PageParams(BaseSchema):
    """通用分页参数"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str = "created_at"
    sort_order: str = "desc"


class ErrorResponse(BaseModel):
    """错误响应"""
    code: str
    message: str
    detail: str | None = None


class MessageResponse(BaseModel):
    """无返回值操作的成功响应"""
    message: str = "操作成功"
