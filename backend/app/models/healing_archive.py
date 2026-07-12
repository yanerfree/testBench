import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class HealingArchive(Base):
    """修复档案 — 记录每次 UI 脚本修复的经验"""
    __tablename__ = "healing_archives"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    step_seq: Mapped[int] = mapped_column(nullable=False)
    step_action: Mapped[str] = mapped_column(String(500), nullable=False)
    page_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    failure_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="script_bug"
    )  # script_bug / system_bug / case_expired / dependency
    original_code: Mapped[str] = mapped_column(Text, nullable=False)
    error_summary: Mapped[str] = mapped_column(Text, nullable=False)
    fix_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_method: Mapped[str | None] = mapped_column(String(200), nullable=True)
    page_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
