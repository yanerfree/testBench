"""api_test_folders

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'

def upgrade() -> None:
    op.create_table('api_test_folders',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('branch_id', sa.UUID(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['api_test_folders.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'name', 'parent_id', name='uq_api_test_folder'),
    )
    # Change folder_id FK from case_folders to api_test_folders
    op.drop_constraint('fk_api_test_scenarios_folder', 'api_test_scenarios', type_='foreignkey')
    op.create_foreign_key('fk_api_test_scenarios_folder', 'api_test_scenarios', 'api_test_folders', ['folder_id'], ['id'])

def downgrade() -> None:
    op.drop_constraint('fk_api_test_scenarios_folder', 'api_test_scenarios', type_='foreignkey')
    op.create_foreign_key('fk_api_test_scenarios_folder', 'api_test_scenarios', 'case_folders', ['folder_id'], ['id'])
    op.drop_table('api_test_folders')
