"""add edit fields to api_test

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'

def upgrade() -> None:
    op.add_column('api_test_scenarios', sa.Column('source', sa.String(10), server_default='ai', nullable=False))
    op.add_column('api_test_scenarios', sa.Column('pre_steps', postgresql.JSONB(), nullable=True))
    op.add_column('api_test_steps', sa.Column('enabled', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('api_test_steps', sa.Column('pre_script', postgresql.JSONB(), nullable=True))
    op.add_column('api_test_steps', sa.Column('post_script', postgresql.JSONB(), nullable=True))

def downgrade() -> None:
    op.drop_column('api_test_steps', 'post_script')
    op.drop_column('api_test_steps', 'pre_script')
    op.drop_column('api_test_steps', 'enabled')
    op.drop_column('api_test_scenarios', 'pre_steps')
    op.drop_column('api_test_scenarios', 'source')
