"""add test_report_steps table

Revision ID: b2c3d4e5f6a7
Revises: adcdd863ddc5
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a7"
down_revision = "adcdd863ddc5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "test_report_steps",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("scenario_id", sa.UUID(), nullable=False),
        sa.Column("step_name", sa.String(200), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("http_method", sa.String(10), nullable=True),
        sa.Column("url", sa.String(1000), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.BigInteger(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("request_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("response_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("assertions", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["scenario_id"], ["test_report_scenarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_test_report_steps_scenario_id", "test_report_steps", ["scenario_id"])


def downgrade() -> None:
    op.drop_index("ix_test_report_steps_scenario_id", table_name="test_report_steps")
    op.drop_table("test_report_steps")
