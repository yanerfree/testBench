"""add scripts table

Revision ID: c3e5f7a9b1d3
Revises: b2d4e6f8a0c2
Create Date: 2026-06-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "c3e5f7a9b1d3"
down_revision = "b2d4e6f8a0c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scripts",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("case_id", UUID(as_uuid=True), sa.ForeignKey("cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("script_type", sa.String(10), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("language", sa.String(20), nullable=False, server_default="python"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("file_name", sa.String(500), nullable=True),
        sa.Column("func_name", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("commit_sha", sa.String(40), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("case_id", "script_type", "version", name="uq_script_case_type_version"),
    )
    op.create_index("ix_scripts_case_type_status", "scripts", ["case_id", "script_type", "status"])


def downgrade() -> None:
    op.drop_index("ix_scripts_case_type_status")
    op.drop_table("scripts")
