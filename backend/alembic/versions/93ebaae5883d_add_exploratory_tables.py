"""add_exploratory_tables

Revision ID: 93ebaae5883d
Revises: 1cad598605a8
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '93ebaae5883d'
down_revision: Union[str, None] = '1cad598605a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'exploratory_sessions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('target_module', sa.String(100), nullable=True),
        sa.Column('time_limit_minutes', sa.Integer(), server_default='30', nullable=False),
        sa.Column('status', sa.String(20), server_default='active', nullable=False),
        sa.Column('charter', postgresql.JSONB(), nullable=True),
        sa.Column('checkpoints', postgresql.JSONB(), nullable=True),
        sa.Column('completed_checkpoints', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_checkpoints', sa.Integer(), server_default='0', nullable=False),
        sa.Column('summary', postgresql.JSONB(), nullable=True),
        sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'exploratory_findings',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('session_id', sa.UUID(), sa.ForeignKey('exploratory_sessions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('finding_type', sa.String(20), nullable=False),
        sa.Column('severity', sa.String(10), server_default='medium', nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('checkpoint', sa.String(100), nullable=True),
        sa.Column('screenshot_url', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('exploratory_findings')
    op.drop_table('exploratory_sessions')
