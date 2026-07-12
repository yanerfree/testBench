"""add_http_requests_table

Revision ID: c8d9e0f1a2b3
Revises: b7e2d4f19c3a
Create Date: 2026-07-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, None] = 'b7e2d4f19c3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'http_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('type', sa.String(10), nullable=False, server_default='request'),
        sa.Column('name', sa.String(200), nullable=False, server_default='新请求'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('method', sa.String(10), nullable=False, server_default='GET'),
        sa.Column('url', sa.String(2000), nullable=False, server_default=''),
        sa.Column('headers', postgresql.JSONB(), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('body_type', sa.String(20), nullable=False, server_default='none'),
        sa.Column('auth_type', sa.String(20), nullable=False, server_default='none'),
        sa.Column('auth_config', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('http_requests')
