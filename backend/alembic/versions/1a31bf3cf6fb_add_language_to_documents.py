"""add_language_to_documents

Revision ID: 1a31bf3cf6fb
Revises: b8f1fbc3c1bc
Create Date: 2026-06-30 15:38:32.126459

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '1a31bf3cf6fb'
down_revision: Union[str, None] = 'b8f1fbc3c1bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('language', sa.String(length=10), server_default='zh', nullable=False))


def downgrade() -> None:
    op.drop_column('documents', 'language')
