import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class CaseFolder(Base):
    """用例目录（路径模式，最多 4 层）"""
    __tablename__ = "case_folders"
    __table_args__ = (
        UniqueConstraint("branch_id", "path", name="uq_folder_branch_path"),
        CheckConstraint("depth <= 4", name="ck_folder_max_depth"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("case_folders.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Case(Base):
    """用例"""
    __tablename__ = "cases"
    __table_args__ = (
        UniqueConstraint("branch_id", "case_code", name="uq_case_branch_code"),
        UniqueConstraint("branch_id", "tea_id", name="uq_case_branch_tea_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    case_code: Mapped[str] = mapped_column(String(20), nullable=False)
    tea_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # api / e2e
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("case_folders.id"), nullable=True
    )
    priority: Mapped[str] = mapped_column(String(5), nullable=False, default="P2", server_default="P2")
    preconditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    expected_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    automation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )  # automated / pending / script_removed / archived
    source: Mapped[str] = mapped_column(String(10), nullable=False)  # imported / manual
    script_ref_file: Mapped[str | None] = mapped_column(String(500), nullable=True)
    script_ref_func: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_flaky: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
