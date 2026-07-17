"""add setup_refs table

Revision ID: g1a2b3c4d5e6
Revises: f7e8d9c0b1a2
Create Date: 2026-07-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g1a2b3c4d5e6"
down_revision: str = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS setup_refs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            condition_pattern VARCHAR(500) NOT NULL,
            base_url VARCHAR(500) NOT NULL,
            code TEXT NOT NULL,
            verified BOOLEAN NOT NULL DEFAULT false,
            success_count INTEGER NOT NULL DEFAULT 0,
            fail_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.drop_table("setup_refs")
