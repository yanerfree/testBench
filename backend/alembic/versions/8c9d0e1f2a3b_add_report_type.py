"""add report_type and report_name to test_reports, make plan_id nullable

Revision ID: 8c9d0e1f2a3b
Revises: 7a8b9c0d1e2f
Create Date: 2026-07-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '8c9d0e1f2a3b'
down_revision: Union[str, None] = '7a8b9c0d1e2f'

def upgrade() -> None:
    op.alter_column('test_reports', 'plan_id', nullable=True)
    op.add_column('test_reports', sa.Column('report_type', sa.String(20), server_default='plan', nullable=False))
    op.add_column('test_reports', sa.Column('report_name', sa.String(200), nullable=True))

def downgrade() -> None:
    op.drop_column('test_reports', 'report_name')
    op.drop_column('test_reports', 'report_type')
    op.alter_column('test_reports', 'plan_id', nullable=False)
