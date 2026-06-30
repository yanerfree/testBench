"""add gen_config to documents

Revision ID: a2f4c8d91e00
Revises: 1a31bf3cf6fb
Create Date: 2026-06-30
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a2f4c8d91e00'
down_revision: Union[str, None] = '1a31bf3cf6fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('documents', sa.Column('gen_config', postgresql.JSONB(), nullable=True))

def downgrade() -> None:
    op.drop_column('documents', 'gen_config')
