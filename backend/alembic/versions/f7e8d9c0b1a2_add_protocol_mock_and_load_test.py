"""add protocol mock and load test tables

Revision ID: a1b2c3d4e5f6
Revises: f5b8d2a1c3e7, 266911e11ea3, d132d059936f
Create Date: 2026-07-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f7e8d9c0b1a2'
down_revision: Union[str, None] = '266911e11ea3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ═══ WebSocket Mock ═══
    op.create_table(
        'ws_mock_endpoints',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('path', sa.String(500), nullable=False, server_default='/ws'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('response_mode', sa.String(20), nullable=False, server_default='echo'),
        sa.Column('fixed_response', sa.Text(), nullable=True),
        sa.Column('custom_config', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('error_code', sa.Integer(), nullable=True),
        sa.Column('error_reason', sa.String(200), nullable=True),
        sa.Column('support_binary', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('delay_ms', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'ws_mock_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('endpoint_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('event_type', sa.String(20), nullable=False),
        sa.Column('path', sa.String(500), nullable=False),
        sa.Column('client_ip', sa.String(50), nullable=True),
        sa.Column('message_type', sa.String(10), nullable=True),
        sa.Column('message_preview', sa.Text(), nullable=True),
        sa.Column('message_size', sa.Integer(), nullable=True),
        sa.Column('direction', sa.String(3), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ws_mock_logs_timestamp', 'ws_mock_logs', ['timestamp'], postgresql_using='btree')

    # ═══ TCP Mock ═══
    op.create_table(
        'tcp_mock_handlers',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('match_mode', sa.String(20), nullable=False, server_default='exact'),
        sa.Column('match_pattern', sa.Text(), nullable=False, server_default=''),
        sa.Column('response_mode', sa.String(20), nullable=False, server_default='echo'),
        sa.Column('response_data', sa.Text(), nullable=True),
        sa.Column('response_hex', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('delay_ms', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'tcp_mock_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('handler_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('event_type', sa.String(20), nullable=False),
        sa.Column('client_ip', sa.String(50), nullable=True),
        sa.Column('client_port', sa.Integer(), nullable=True),
        sa.Column('data_preview', sa.Text(), nullable=True),
        sa.Column('data_size', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_tcp_mock_logs_timestamp', 'tcp_mock_logs', ['timestamp'], postgresql_using='btree')

    # ═══ UDP Mock ═══
    op.create_table(
        'udp_mock_handlers',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('match_mode', sa.String(20), nullable=False, server_default='exact'),
        sa.Column('match_pattern', sa.Text(), nullable=False, server_default=''),
        sa.Column('response_mode', sa.String(20), nullable=False, server_default='echo'),
        sa.Column('response_data', sa.Text(), nullable=True),
        sa.Column('response_hex', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('delay_ms', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'udp_mock_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('handler_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('client_ip', sa.String(50), nullable=True),
        sa.Column('client_port', sa.Integer(), nullable=True),
        sa.Column('direction', sa.String(3), nullable=True),
        sa.Column('data_preview', sa.Text(), nullable=True),
        sa.Column('data_size', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_udp_mock_logs_timestamp', 'udp_mock_logs', ['timestamp'], postgresql_using='btree')

    # ═══ gRPC Mock ═══
    op.create_table(
        'grpc_mock_services',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('service_name', sa.String(200), nullable=False),
        sa.Column('method_name', sa.String(200), nullable=False),
        sa.Column('method_type', sa.String(20), nullable=False, server_default='unary'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('request_sample', sa.Text(), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=False, server_default='{}'),
        sa.Column('stream_items', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('delay_ms', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('status_code', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('status_message', sa.String(500), nullable=True),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_hit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'grpc_mock_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('service_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('service_name', sa.String(200), nullable=False),
        sa.Column('method_name', sa.String(200), nullable=False),
        sa.Column('method_type', sa.String(20), nullable=False),
        sa.Column('client_ip', sa.String(50), nullable=True),
        sa.Column('request_body', sa.Text(), nullable=True),
        sa.Column('response_body', sa.Text(), nullable=True),
        sa.Column('status_code', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('duration_ms', sa.Float(), nullable=False, server_default=sa.text('0')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_grpc_mock_logs_timestamp', 'grpc_mock_logs', ['timestamp'], postgresql_using='btree')

    # ═══ Load Test ═══
    op.create_table(
        'load_test_scenarios',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('concurrent_users', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('ramp_up_seconds', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('total_iterations', sa.Integer(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('variables', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'load_test_steps',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('scenario_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('name', sa.String(200), nullable=True),
        sa.Column('method', sa.String(10), nullable=False, server_default='GET'),
        sa.Column('url', sa.String(2000), nullable=False),
        sa.Column('headers', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('body_type', sa.String(20), nullable=False, server_default='none'),
        sa.Column('extractions', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('assertions', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_test_steps_scenario', 'load_test_steps', ['scenario_id'], postgresql_using='btree')

    op.create_table(
        'load_test_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('scenario_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('config_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_load_test_runs_scenario', 'load_test_runs', ['scenario_id'], postgresql_using='btree')


def downgrade() -> None:
    op.drop_table('load_test_runs')
    op.drop_table('load_test_steps')
    op.drop_table('load_test_scenarios')
    op.drop_table('grpc_mock_logs')
    op.drop_table('grpc_mock_services')
    op.drop_table('udp_mock_logs')
    op.drop_table('udp_mock_handlers')
    op.drop_table('tcp_mock_logs')
    op.drop_table('tcp_mock_handlers')
    op.drop_table('ws_mock_logs')
    op.drop_table('ws_mock_endpoints')
