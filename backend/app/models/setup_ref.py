import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class SetupRef(Base):
    """前置数据准备代码资产 — 已验证的 setup 代码片段，可跨用例复用"""
    __tablename__ = "setup_refs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    condition_pattern: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    success_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    fail_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
