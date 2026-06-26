"""add_case_file_and_usage_tables

Revision ID: 59ee2400111b
Revises: 1599cd20904e
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '59ee2400111b'
down_revision: Union[str, None] = '1599cd20904e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'case_file_events',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('case_id', sa.UUID(), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('summary', sa.String(500), nullable=True),
        sa.Column('detail', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_case_file_events_case_id', 'case_file_events', ['case_id'])

    op.create_table(
        'ai_usage_logs',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('skill_name', sa.String(50), nullable=False),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('prompt_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('completion_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_tokens', sa.Integer(), server_default='0', nullable=False),
        sa.Column('duration_ms', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ai_usage_logs_project_id', 'ai_usage_logs', ['project_id'])


def downgrade() -> None:
    op.drop_table('ai_usage_logs')
    op.drop_table('case_file_events')
