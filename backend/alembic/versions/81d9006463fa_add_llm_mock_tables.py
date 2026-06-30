"""add_llm_mock_tables

Revision ID: 81d9006463fa
Revises: ec41db6bc5d3
Create Date: 2026-06-12 13:40:16.311194

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '81d9006463fa'
down_revision: Union[str, None] = 'ec41db6bc5d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('mock_request_logs',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('route_id', sa.UUID(), nullable=True),
    sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('method', sa.String(length=10), nullable=False),
    sa.Column('path', sa.String(length=500), nullable=False),
    sa.Column('request_headers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('request_body', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('caller', sa.String(length=500), nullable=True),
    sa.Column('ip', sa.String(length=50), nullable=True),
    sa.Column('status_code', sa.Integer(), nullable=False),
    sa.Column('response_body', sa.Text(), nullable=True),
    sa.Column('response_headers_out', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('request_model', sa.String(length=100), nullable=True),
    sa.Column('response_model', sa.String(length=100), nullable=True),
    sa.Column('prompt_tokens', sa.Integer(), nullable=False),
    sa.Column('completion_tokens', sa.Integer(), nullable=False),
    sa.Column('total_tokens', sa.Integer(), nullable=False),
    sa.Column('finish_reason', sa.String(length=30), nullable=True),
    sa.Column('match_ms', sa.Float(), nullable=False),
    sa.Column('first_byte_ms', sa.Float(), nullable=False),
    sa.Column('body_ms', sa.Float(), nullable=False),
    sa.Column('total_ms', sa.Float(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('mock_routes',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('method', sa.String(length=10), nullable=False),
    sa.Column('path', sa.String(length=500), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('delay_ms', sa.Integer(), nullable=False),
    sa.Column('status_code', sa.Integer(), nullable=False),
    sa.Column('response_format', sa.String(length=10), nullable=False),
    sa.Column('preset_mode', sa.String(length=50), nullable=True),
    sa.Column('finish_reason', sa.String(length=30), nullable=False),
    sa.Column('response_body', sa.Text(), nullable=False),
    sa.Column('token_mode', sa.String(length=10), nullable=False),
    sa.Column('custom_prompt_tokens', sa.Integer(), nullable=True),
    sa.Column('custom_completion_tokens', sa.Integer(), nullable=True),
    sa.Column('model_mode', sa.String(length=20), nullable=False),
    sa.Column('custom_model', sa.String(length=100), nullable=True),
    sa.Column('response_headers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('sse_chunk_delay_ms', sa.Integer(), nullable=False),
    sa.Column('response_type', sa.String(length=20), nullable=False),
    sa.Column('tool_calls', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('hit_count', sa.Integer(), nullable=False),
    sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('mock_routes')
    op.drop_table('mock_request_logs')
