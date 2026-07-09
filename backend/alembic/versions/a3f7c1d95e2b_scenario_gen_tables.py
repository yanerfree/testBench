"""scenario-gen module: 7 tables + cases AI review columns

Revision ID: a3f7c1d95e2b
Revises: 9d0e1f2a3b4c
Create Date: 2026-07-08 20:00:00.000000

功能场景测试模块 S1.1（ADR-2）：
- 新建 requirement_docs / generation_tasks / requirement_points / scenario_models
  / generation_items / case_gen_events / task_events
- cases 扩展 6 列（review_status / review_reason / quality_score /
  generation_task_id / requirement_point_ids / version）+ GIN 索引
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a3f7c1d95e2b'
down_revision: Union[str, None] = '9d0e1f2a3b4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'requirement_docs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('branch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source', sa.String(10), nullable=False, server_default='paste'),
        sa.Column('filename', sa.String(255), nullable=True),
        sa.Column('content_markdown', sa.Text(), nullable=False),
        sa.Column('content_meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'generation_tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('branch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('doc_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('requirement_docs.id', ondelete='SET NULL'), nullable=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='extracting'),
        sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('context_summary', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('health_check', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('progress', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('token_estimated', sa.Integer(), nullable=True),
        sa.Column('token_used', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'requirement_points',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('generation_tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('doc_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('requirement_docs.id', ondelete='CASCADE'), nullable=True),
        sa.Column('code', sa.String(10), nullable=False),
        sa.Column('title', sa.String(300), nullable=False),
        sa.Column('quote_text', sa.Text(), nullable=True),
        sa.Column('quote_offset', sa.Integer(), nullable=True),
        sa.Column('anchor_status', sa.String(12), nullable=False, server_default='anchored'),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('na_reason', sa.Text(), nullable=True),
        sa.Column('created_by_ai', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('task_id', 'code', name='uq_reqpoint_task_code'),
    )
    op.create_index('ix_reqpoint_task', 'requirement_points', ['task_id'])

    op.create_table(
        'scenario_models',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('generation_tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('flows', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('state_transitions', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('role_matrix', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('test_points', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
        sa.Column('status', sa.String(12), nullable=False, server_default='draft'),
        sa.Column('edited_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('confirmed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('task_id', name='uq_scenario_model_task'),
    )

    op.create_table(
        'generation_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('generation_tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('test_point_ref', sa.String(50), nullable=False),
        sa.Column('point_snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('status', sa.String(12), nullable=False, server_default='pending'),
        sa.Column('error_step', sa.String(30), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('case_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cases.id', ondelete='SET NULL'), nullable=True),
        sa.Column('dedup_case_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cases.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('task_id', 'test_point_ref', name='uq_genitem_task_point'),
    )
    op.create_index('ix_genitem_task', 'generation_items', ['task_id'])

    op.create_table(
        'case_gen_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('case_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('cases.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(20), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('actor', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_casegenevent_case', 'case_gen_events', ['case_id'])

    op.create_table(
        'task_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('generation_tasks.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_taskevent_task_seq', 'task_events', ['task_id', 'id'])

    # cases 扩展列（全部兼容旧数据）
    op.add_column('cases', sa.Column('review_status', sa.String(20), nullable=True))
    op.add_column('cases', sa.Column('review_reason', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('cases', sa.Column('quality_score', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('cases', sa.Column(
        'generation_task_id', postgresql.UUID(as_uuid=True),
        sa.ForeignKey('generation_tasks.id', ondelete='SET NULL', name='fk_cases_generation_task'), nullable=True,
    ))
    op.add_column('cases', sa.Column('requirement_point_ids', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('cases', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
    op.create_index(
        'ix_cases_requirement_point_ids', 'cases', ['requirement_point_ids'],
        postgresql_using='gin',
    )


def downgrade() -> None:
    op.drop_index('ix_cases_requirement_point_ids', table_name='cases')
    op.drop_column('cases', 'version')
    op.drop_column('cases', 'requirement_point_ids')
    op.drop_constraint('fk_cases_generation_task', 'cases', type_='foreignkey')
    op.drop_column('cases', 'generation_task_id')
    op.drop_column('cases', 'quality_score')
    op.drop_column('cases', 'review_reason')
    op.drop_column('cases', 'review_status')

    op.drop_index('ix_taskevent_task_seq', table_name='task_events')
    op.drop_table('task_events')
    op.drop_index('ix_casegenevent_case', table_name='case_gen_events')
    op.drop_table('case_gen_events')
    op.drop_index('ix_genitem_task', table_name='generation_items')
    op.drop_table('generation_items')
    op.drop_table('scenario_models')
    op.drop_index('ix_reqpoint_task', table_name='requirement_points')
    op.drop_table('requirement_points')
    op.drop_table('generation_tasks')
    op.drop_table('requirement_docs')
