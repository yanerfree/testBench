"""add_knowledge_entries

Revision ID: e09259308460
Revises: 59ee2400111b
Create Date: 2026-06-26 14:02:21.424387

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e09259308460'
down_revision: Union[str, None] = '59ee2400111b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'knowledge_entries',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('category', sa.String(30), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('source', sa.String(30), server_default='manual', nullable=False),
        sa.Column('reference_id', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('knowledge_entries')
