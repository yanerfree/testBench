"""add_response_mode_to_mock_routes

Revision ID: b9a580150404
Revises: 81d9006463fa
Create Date: 2026-06-18 10:02:59.393884

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b9a580150404'
down_revision: Union[str, None] = '81d9006463fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mock_routes', sa.Column('response_mode', sa.String(length=20), nullable=True))
    op.execute("UPDATE mock_routes SET response_mode = 'default' WHERE response_mode IS NULL")
    op.alter_column('mock_routes', 'response_mode', nullable=False, server_default='default')


def downgrade() -> None:
    op.drop_column('mock_routes', 'response_mode')
