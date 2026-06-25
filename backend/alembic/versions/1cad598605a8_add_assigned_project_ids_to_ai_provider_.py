"""add_assigned_project_ids_to_ai_provider_configs

Revision ID: 1cad598605a8
Revises: fcc88a9e934b
Create Date: 2026-06-25 10:40:03.216112

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1cad598605a8'
down_revision: Union[str, None] = 'fcc88a9e934b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'ai_provider_configs',
        sa.Column('assigned_project_ids', postgresql.JSONB(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('ai_provider_configs', 'assigned_project_ids')
