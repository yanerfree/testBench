"""add_documents_table

Revision ID: 1599cd20904e
Revises: 93ebaae5883d
Create Date: 2026-06-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '1599cd20904e'
down_revision: Union[str, None] = '93ebaae5883d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'documents',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('project_id', sa.UUID(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('doc_type', sa.String(20), server_default='manual', nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('source_case_ids', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(20), server_default='draft', nullable=False),
        sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('documents')
