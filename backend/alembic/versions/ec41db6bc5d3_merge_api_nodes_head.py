"""merge api_nodes head

Revision ID: ec41db6bc5d3
Revises: a2b3c4d5e6f7, c3e5f7a9b1d3
Create Date: 2026-06-09 11:09:04.741041

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ec41db6bc5d3'
down_revision: Union[str, None] = ('a2b3c4d5e6f7', 'c3e5f7a9b1d3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
