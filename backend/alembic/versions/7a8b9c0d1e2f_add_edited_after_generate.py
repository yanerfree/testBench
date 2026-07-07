"""add edited_after_generate to api_test_scenarios

Revision ID: 7a8b9c0d1e2f
Revises: f1a2b3c4d5e6
Create Date: 2026-07-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '7a8b9c0d1e2f'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'

def upgrade() -> None:
    op.add_column('api_test_scenarios', sa.Column('edited_after_generate', sa.Boolean(), server_default='false', nullable=False))

def downgrade() -> None:
    op.drop_column('api_test_scenarios', 'edited_after_generate')
