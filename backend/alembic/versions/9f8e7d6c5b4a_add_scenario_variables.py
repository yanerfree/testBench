"""add scenario_variables + merge heads (load_test / setup_refs)

Revision ID: a1b2c3d4e5f6
Revises: f7e8d9c0b1a2, g1a2b3c4d5e6
Create Date: 2026-07-20

合并此前分叉的两个 alembic head，并新增 scenario_variables 表（用例级场景变量，UI/接口共用）。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "9f8e7d6c5b4a"
down_revision = ("f7e8d9c0b1a2", "g1a2b3c4d5e6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenario_variables",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("kind", sa.String(length=20), server_default="literal", nullable=False),
        sa.Column("value_template", sa.Text(), server_default="", nullable=False),
        sa.Column("var_type", sa.String(length=20), server_default="string", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_id", "name", name="uq_scenario_var_case_name"),
    )
    op.create_index("ix_scenario_variables_case_id", "scenario_variables", ["case_id"])


def downgrade() -> None:
    op.drop_index("ix_scenario_variables_case_id", table_name="scenario_variables")
    op.drop_table("scenario_variables")
