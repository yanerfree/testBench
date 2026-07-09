"""add mcp_api_keys table

Revision ID: c6f7d8e9a0b1
Revises: b5e8d2c4f7a1
Create Date: 2026-07-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'c6f7d8e9a0b1'
down_revision = 'b5e8d2c4f7a1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'mcp_api_keys',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), default='default'),
        sa.Column('key_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('key_prefix', sa.String(8), nullable=False),
        sa.Column('is_active', sa.Boolean, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('mcp_api_keys')
