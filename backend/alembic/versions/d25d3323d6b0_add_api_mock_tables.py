"""add_api_mock_tables

Revision ID: d25d3323d6b0
Revises: b9a580150404
Create Date: 2026-06-18 11:23:20.309823

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd25d3323d6b0'
down_revision: Union[str, None] = 'b9a580150404'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'api_mock_routes',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('method', sa.String(10), nullable=False, server_default='GET'),
        sa.Column('path', sa.String(500), nullable=False, server_default='/api/example'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('delay_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status_code', sa.Integer(), nullable=False, server_default='200'),
        sa.Column('content_type', sa.String(100), nullable=False, server_default='application/json'),
        sa.Column('response_body', sa.Text(), nullable=False, server_default='{"code":0,"message":"success","data":null}'),
        sa.Column('response_headers', postgresql.JSONB(), nullable=True),
        sa.Column('response_mode', sa.String(20), nullable=False, server_default='default'),
        sa.Column('match_mode', sa.String(20), nullable=False, server_default='exact'),
        sa.Column('proxy_url', sa.String(500), nullable=True),
        sa.Column('proxy_modify_response', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'api_mock_logs',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('route_id', sa.UUID(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('method', sa.String(10), nullable=False),
        sa.Column('path', sa.String(500), nullable=False),
        sa.Column('request_headers', postgresql.JSONB(), nullable=True),
        sa.Column('request_body', sa.Text(), nullable=True),
        sa.Column('caller', sa.String(500), nullable=True),
        sa.Column('ip', sa.String(50), nullable=True),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=True),
        sa.Column('response_headers_out', postgresql.JSONB(), nullable=True),
        sa.Column('match_ms', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_ms', sa.Float(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('api_mock_logs')
    op.drop_table('api_mock_routes')
