import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.user import Base


class RequirementDoc(Base):
    """需求材料快照（与生成任务 1:1）"""
    __tablename__ = "requirement_docs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="paste", server_default="paste")  # paste / upload
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    # 预处理元信息：{char_count, stripped_sections: [], chunks: N}
    content_meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class GenerationTask(Base):
    """两段式生成任务（job 级）"""
    __tablename__ = "generation_tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    doc_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_docs.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # extracting → model_ready → confirmed → generating → completed | partial_failed | failed | aborted
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="extracting", server_default="extracting")
    # 生成设置：{module, api_ids: [], business_rules, target_folder_id, case_limit}
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # 上下文组成预览：{doc_chars, api_count, sample_count, reject_reasons_count}
    context_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # 需求健康分：{score, issues: [{category, severity, quote, suggestion, ignored_by}]}
    health_check: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # 进度计数：{total, succeeded, failed, skipped}
    progress: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    token_estimated: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RequirementPoint(Base):
    """需求点（带原文引用锚定）"""
    __tablename__ = "requirement_points"
    __table_args__ = (
        UniqueConstraint("task_id", "code", name="uq_reqpoint_task_code"),
        Index("ix_reqpoint_task", "task_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=False
    )
    doc_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requirement_docs.id", ondelete="CASCADE"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(10), nullable=False)  # R1, R2 ...
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    quote_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_offset: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # anchored / fuzzy / unanchored（ADR-8 三级锚定降级）
    anchor_status: Mapped[str] = mapped_column(String(12), nullable=False, default="anchored", server_default="anchored")
    # active / not_applicable（FR33 标注不适用/转 NFR）
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    na_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_ai: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ScenarioModel(Base):
    """场景模型（两段式的中间产物，与任务 1:1，持久化不放会话）"""
    __tablename__ = "scenario_models"
    __table_args__ = (UniqueConstraint("task_id", name="uq_scenario_model_task"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=False
    )
    # 四区块（JSONB 数组）：业务流程 / 状态转换 / 角色权限矩阵 / 测试点清单
    flows: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    state_transitions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    role_matrix: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # 测试点：[{ref, requirement_point_code, dimension(白名单枚举), priority, title, note}]
    test_points: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # draft / confirmed / skipped（跳过确认快捷路径仍保留模型）
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft", server_default="draft")
    # 用户编辑标记（✎ 持久显示）：{"test_points": ["tp-3"], ...}
    edited_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class GenerationItem(Base):
    """生成任务项（一测试点一行，断点续跑与幂等的最小单元）"""
    __tablename__ = "generation_items"
    __table_args__ = (
        UniqueConstraint("task_id", "test_point_ref", name="uq_genitem_task_point"),
        Index("ix_genitem_task", "task_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=False
    )
    test_point_ref: Mapped[str] = mapped_column(String(50), nullable=False)
    # 测试点内容快照（模型后续被编辑不影响已生成 item 的可追溯性）
    point_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # pending / running / succeeded / failed / skipped(去重)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending", server_default="pending")
    # 失败环节：expand / static_validate / self_review / persist
    error_step: Mapped[str | None] = mapped_column(String(30), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    # 去重跳过时指向已有用例（FR18 对应关系展示）
    dedup_case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CaseGenEvent(Base):
    """用例生成档案（append-only 事件序列，FR57）"""
    __tablename__ = "case_gen_events"
    __table_args__ = (Index("ix_casegenevent_case", "case_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False
    )
    # generated / scored / reviewed / rejected / regenerated
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # {model, prompt_version, requirement_point_ids, reason, score, task_id ...}
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    # 操作者：username / "ai" / "mcp:{key_name}"
    actor: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TaskEvent(Base):
    """任务事件流水（SSE 回放 + 时间线，ADR-3；BigInteger 自增主键即回放 seq）"""
    __tablename__ = "task_events"
    __table_args__ = (Index("ix_taskevent_task_seq", "task_id", "id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=False
    )
    # task_state / point_start / case_created / case_skipped / score_updated / point_failed / done
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # 单事件 ≤2KB：大对象只放 ID，前端按需拉取
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
