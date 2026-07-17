from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class LoadTestScenarioCreate(BaseSchema):
    name: str = Field(max_length=200)
    description: str | None = None
    concurrent_users: int = Field(default=1, ge=1, le=1000)
    ramp_up_seconds: int = Field(default=0, ge=0)
    total_iterations: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)
    variables: list | None = None


class LoadTestScenarioUpdate(BaseSchema):
    name: str | None = None
    description: str | None = Field(default=None)
    concurrent_users: int | None = Field(default=None, ge=1, le=1000)
    ramp_up_seconds: int | None = Field(default=None, ge=0)
    total_iterations: int | None = Field(default=None)
    duration_seconds: int | None = Field(default=None)
    variables: list | None = Field(default=None)


class LoadTestScenarioResponse(BaseSchema):
    id: uuid.UUID
    name: str
    description: str | None
    concurrent_users: int
    ramp_up_seconds: int
    total_iterations: int | None
    duration_seconds: int | None
    variables: list | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class LoadTestStepCreate(BaseSchema):
    name: str | None = None
    method: str = Field(default="GET", max_length=10)
    url: str = Field(max_length=2000)
    headers: list | None = None
    body: str | None = None
    body_type: str = Field(default="none")
    extractions: list | None = None
    assertions: list | None = None


class LoadTestStepUpdate(BaseSchema):
    name: str | None = None
    method: str | None = None
    url: str | None = None
    headers: list | None = Field(default=None)
    body: str | None = Field(default=None)
    body_type: str | None = None
    extractions: list | None = Field(default=None)
    assertions: list | None = Field(default=None)
    sort_order: int | None = None


class LoadTestStepResponse(BaseSchema):
    id: uuid.UUID
    scenario_id: uuid.UUID
    sort_order: int
    name: str | None
    method: str
    url: str
    headers: list | None
    body: str | None
    body_type: str
    extractions: list | None
    assertions: list | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class LoadTestRunResponse(BaseSchema):
    id: uuid.UUID
    scenario_id: uuid.UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    config_snapshot: dict
    summary: dict | None
    created_at: datetime
    model_config = {"from_attributes": True}


class LoadTestStartRequest(BaseSchema):
    concurrent_users: int | None = None
    ramp_up_seconds: int | None = None
    total_iterations: int | None = None
    duration_seconds: int | None = None
