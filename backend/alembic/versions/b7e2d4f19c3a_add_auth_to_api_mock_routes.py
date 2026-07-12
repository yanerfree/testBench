"""add_auth_to_api_mock_routes

Revision ID: b7e2d4f19c3a
Revises: a3f1c8e72b4d
Create Date: 2026-07-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'b7e2d4f19c3a'
down_revision: Union[str, None] = '93b33cf37280'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('api_mock_routes', sa.Column('auth_type', sa.String(20), nullable=False, server_default='none'))
    op.add_column('api_mock_routes', sa.Column('auth_config', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('api_mock_routes', 'auth_config')
    op.drop_column('api_mock_routes', 'auth_type')
