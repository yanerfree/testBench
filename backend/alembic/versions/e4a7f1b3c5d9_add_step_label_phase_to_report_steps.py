"""add step_label and step_phase to test_report_steps

Revision ID: e4a7f1b3c5d9
Revises: d638f4268d27
Create Date: 2026-05-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e4a7f1b3c5d9'
down_revision: Union[str, None] = 'd638f4268d27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('test_report_steps', sa.Column('step_label', sa.String(length=500), nullable=True))
    op.add_column('test_report_steps', sa.Column('step_phase', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('test_report_steps', 'step_phase')
    op.drop_column('test_report_steps', 'step_label')
