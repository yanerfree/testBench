"""add_folder_to_documents

Revision ID: b8f1fbc3c1bc
Revises: e09259308460
Create Date: 2026-06-29 15:25:06.607016

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f1fbc3c1bc'
down_revision: Union[str, None] = 'e09259308460'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
