"""add project_id to test_reports

Revision ID: 9d0e1f2a3b4c
Revises: 8c9d0e1f2a3b
Create Date: 2026-07-07
"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = '9d0e1f2a3b4c'
down_revision: Union[str, None] = '8c9d0e1f2a3b'

def upgrade() -> None:
    op.add_column('test_reports', sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=True))

def downgrade() -> None:
    op.drop_column('test_reports', 'project_id')
