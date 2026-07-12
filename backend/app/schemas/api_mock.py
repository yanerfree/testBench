from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


# ───── Route Schemas ─────

class ApiMockRouteCreate(BaseSchema):
    name: str = Field(max_length=100)
    method: str = Field(default="GET", max_length=10)
    path: str = Field(default="/api/example", max_length=500)
    enabled: bool = True
    delay_ms: int = Field(default=0, ge=0)
    status_code: int = Field(default=200)
    content_type: str = Field(default="application/json", max_length=100)
    response_body: str = '{"code":0,"message":"success","data":null}'
    response_headers: dict | None = None
    response_mode: str = Field(default="default")
    match_mode: str = Field(default="exact")
    proxy_url: str | None = None
    proxy_modify_response: bool = False
    auth_type: str = Field(default="none")
    auth_config: dict | None = None


class ApiMockRouteUpdate(BaseSchema):
    name: str | None = None
    method: str | None = None
    path: str | None = None
    enabled: bool | None = None
    delay_ms: int | None = None
    status_code: int | None = None
    content_type: str | None = None
    response_body: str | None = None
    response_headers: dict | None = Field(default=None)
    response_mode: str | None = None
    match_mode: str | None = None
    proxy_url: str | None = Field(default=None)
    proxy_modify_response: bool | None = None
    auth_type: str | None = None
    auth_config: dict | None = Field(default=None)


class ApiMockRouteResponse(BaseSchema):
    id: uuid.UUID
    name: str
    method: str
    path: str
    enabled: bool
    sort_order: int
    delay_ms: int
    status_code: int
    content_type: str
    response_body: str
    response_headers: dict | None
    response_mode: str
    match_mode: str
    proxy_url: str | None
    proxy_modify_response: bool
    auth_type: str
    auth_config: dict | None
    hit_count: int
    last_hit_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ───── Log Schemas ─────

class ApiMockLogResponse(BaseSchema):
    id: uuid.UUID
    route_id: uuid.UUID | None
    timestamp: datetime
    method: str
    path: str
    caller: str | None
    ip: str | None
    status_code: int
    content_type: str | None
    match_ms: float
    total_ms: float

    model_config = {"from_attributes": True}


class ApiMockLogDetailResponse(ApiMockLogResponse):
    request_headers: dict | None
    request_body: str | None
    response_body: str | None
    response_headers_out: dict | None


# ───── Service Schemas ─────

class ApiMockServiceStatus(BaseSchema):
    running: bool
    port: int
    capture_enabled: bool
    routes_count: int
    routes_enabled: int
    total_requests: int


class ApiMockServiceConfig(BaseSchema):
    port: int = 9200
    capture_enabled: bool = True
    max_log_count: int = 1000
    listen_host: str = "0.0.0.0"


# ───── Reorder ─────

class ApiMockReorderItem(BaseSchema):
    id: uuid.UUID
    sort_order: int


class ApiMockReorderRequest(BaseSchema):
    items: list[ApiMockReorderItem]
