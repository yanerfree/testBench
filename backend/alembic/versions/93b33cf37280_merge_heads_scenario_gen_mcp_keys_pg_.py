"""merge heads: scenario_gen + mcp_keys + pg_trgm

Revision ID: 93b33cf37280
Revises: b7c8d9e0f1a2, c6f7d8e9a0b1
Create Date: 2026-07-09 16:34:59.694659

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93b33cf37280'
down_revision: Union[str, None] = ('b7c8d9e0f1a2', 'c6f7d8e9a0b1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
