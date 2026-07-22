import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class AutomationResource(Base):
    """项目级自动化共享资源（全局数据）——跑自动化前预检其存在性。

    exists_check: JSON —— 存在性检查定义，如
        {"method":"GET","url":"/api/v1/services","match":{"field":"name","equals":"default-upstream"}}
    create_def: JSON(可选) —— 缺失时的创建定义（method/url/参数模板）；仅在用户确认后使用。
    keep=true: 长期保留、绝不被测试删除（区别于用例场景数据的自建自删）。
    """
    __tablename__ = "automation_resources"
    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_automation_resource_project_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    exists_check: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    create_def: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    keep: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
