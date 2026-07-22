import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class ScenarioVariable(Base):
    """场景变量（用例级）——UI 与接口测试共用同一份。

    kind:
      - literal      固定值（value_template 即最终值）
      - random       唯一化值（value_template 为前缀，执行期补 _${runId}_${rand}）
      - global_ref   引用项目全局数据（value_template 为全局键名）
    场景内"上一步提取→下一步用"的中间值不建此变量（走脚本内 extract）。
    """
    __tablename__ = "scenario_variables"
    __table_args__ = (
        UniqueConstraint("case_id", "name", name="uq_scenario_var_case_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="literal")
    value_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    var_type: Mapped[str] = mapped_column(String(20), nullable=False, default="string")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
