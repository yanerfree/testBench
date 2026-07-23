"""add case.is_core (核心/标杆用例)

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa

revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("is_core", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("cases", "is_core")
