"""add scenario status and template flags

Revision ID: b2d4e6f8a0c2
Revises: a1c2d3e4f5g6
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa

revision = "b2d4e6f8a0c2"
down_revision = "a1c2d3e4f5g6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("api_scenario_status", sa.String(20), server_default="draft", nullable=False))
    op.add_column("cases", sa.Column("ui_scenario_status", sa.String(20), server_default="draft", nullable=False))
    op.add_column("cases", sa.Column("is_api_template", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("cases", sa.Column("is_ui_template", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("cases", "is_ui_template")
    op.drop_column("cases", "is_api_template")
    op.drop_column("cases", "ui_scenario_status")
    op.drop_column("cases", "api_scenario_status")
