import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class CreateNodeRequest(BaseSchema):
    parent_id: uuid.UUID | None = None
    node_type: Literal["folder", "endpoint"] = "endpoint"
    name: str = Field(min_length=1, max_length=200)
    method: str | None = "GET"
    url: str | None = ""
    params: list[dict] | None = None
    headers: list[dict] | None = None
    body: str | None = ""
    body_type: str | None = "json"
    auth: dict | None = None
    description: str | None = ""
    sort_order: int = 0


class UpdateNodeRequest(BaseSchema):
    name: str | None = None
    parent_id: uuid.UUID | None = Field(default=None, description="移动到新父节点")
    method: str | None = None
    url: str | None = None
    params: list[dict] | None = None
    headers: list[dict] | None = None
    body: str | None = None
    body_type: str | None = None
    auth: dict | None = None
    description: str | None = None
    sort_order: int | None = None


class NodeResponse(BaseSchema):
    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    node_type: str
    name: str
    sort_order: int = 0
    method: str | None = None
    url: str | None = None
    params: list[dict] | None = None
    headers: list[dict] | None = None
    body: str | None = None
    body_type: str | None = None
    auth: dict | None = None
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ImportPostmanRequest(BaseSchema):
    collection: dict
