import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, Float, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class ApiMockRoute(Base):
    __tablename__ = "api_mock_routes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    path: Mapped[str] = mapped_column(String(500), nullable=False, default="/api/example")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    delay_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="application/json")
    response_body: Mapped[str] = mapped_column(Text, nullable=False, default='{"code":0,"message":"success","data":null}')
    response_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    response_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="default")

    match_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="exact")
    proxy_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    proxy_modify_response: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_hit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ApiMockLog(Base):
    __tablename__ = "api_mock_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    route_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    request_headers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    request_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    caller: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_headers_out: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    match_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
