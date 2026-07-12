import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class HttpRequest(Base):
    __tablename__ = "http_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    type: Mapped[str] = mapped_column(String(10), nullable=False, default="request")
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="新请求")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    method: Mapped[str] = mapped_column(String(10), nullable=False, default="GET")
    url: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    headers: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    auth_type: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    auth_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
