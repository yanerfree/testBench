"""enable pg_trgm extension

Revision ID: b7c8d9e0f1a2
Revises: a3f7c1d95e2b
Create Date: 2026-07-09 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a3f7c1d95e2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
