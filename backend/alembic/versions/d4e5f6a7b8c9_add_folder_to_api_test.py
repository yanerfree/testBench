"""add folder_id to api_test_scenarios

Revision ID: d4e5f6a7b8c9
Revises: c3a1f7e82d10
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3a1f7e82d10'

def upgrade() -> None:
    op.add_column('api_test_scenarios', sa.Column('folder_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_api_test_scenarios_folder', 'api_test_scenarios', 'case_folders', ['folder_id'], ['id'])

def downgrade() -> None:
    op.drop_constraint('fk_api_test_scenarios_folder', 'api_test_scenarios')
    op.drop_column('api_test_scenarios', 'folder_id')
