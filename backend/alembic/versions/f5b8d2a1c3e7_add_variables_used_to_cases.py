"""add variables_used to cases

Revision ID: f5b8d2a1c3e7
Revises: e4a7f1b3c5d9
Create Date: 2026-05-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f5b8d2a1c3e7'
down_revision: Union[str, None] = 'e4a7f1b3c5d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cases', sa.Column('variables_used', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('cases', 'variables_used')
