"""add_script_runs_table

Revision ID: 4bea211d2502
Revises: a3f1c8e72b4d
Create Date: 2026-06-22 14:21:01.094417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '4bea211d2502'
down_revision: Union[str, None] = 'a3f1c8e72b4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('script_runs',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('case_id', sa.UUID(), nullable=False),
    sa.Column('script_id', sa.UUID(), nullable=True),
    sa.Column('script_type', sa.String(length=10), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('duration_ms', sa.BigInteger(), nullable=True),
    sa.Column('error_summary', sa.Text(), nullable=True),
    sa.Column('stdout', sa.Text(), nullable=True),
    sa.Column('executed_by', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['executed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['script_id'], ['scripts.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('script_runs')
