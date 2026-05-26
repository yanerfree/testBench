"""add api_scenario and ui_scenario to cases

Revision ID: a1c2d3e4f5g6
Revises: f5b8d2a1c3e7
Create Date: 2026-05-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "a1c2d3e4f5g6"
down_revision = "f5b8d2a1c3e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("api_scenario", JSONB, nullable=True))
    op.add_column("cases", sa.Column("ui_scenario", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("cases", "ui_scenario")
    op.drop_column("cases", "api_scenario")
