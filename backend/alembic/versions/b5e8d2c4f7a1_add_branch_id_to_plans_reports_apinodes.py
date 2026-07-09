"""add branch_id to api_nodes, plans, test_reports (S9.1 分支全页面)

Revision ID: b5e8d2c4f7a1
Revises: a3f7c1d95e2b
Create Date: 2026-07-09
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "b5e8d2c4f7a1"
down_revision = "a3f7c1d95e2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_nodes", sa.Column("branch_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_api_nodes_branch", "api_nodes", "branches", ["branch_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_api_nodes_branch_id", "api_nodes", ["branch_id"])

    op.add_column("plans", sa.Column("branch_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_plans_branch", "plans", "branches", ["branch_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_plans_branch_id", "plans", ["branch_id"])

    op.add_column("test_reports", sa.Column("branch_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_test_reports_branch", "test_reports", "branches", ["branch_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_test_reports_branch_id", "test_reports", ["branch_id"])


def downgrade() -> None:
    op.drop_index("ix_test_reports_branch_id", table_name="test_reports")
    op.drop_constraint("fk_test_reports_branch", "test_reports", type_="foreignkey")
    op.drop_column("test_reports", "branch_id")

    op.drop_index("ix_plans_branch_id", table_name="plans")
    op.drop_constraint("fk_plans_branch", "plans", type_="foreignkey")
    op.drop_column("plans", "branch_id")

    op.drop_index("ix_api_nodes_branch_id", table_name="api_nodes")
    op.drop_constraint("fk_api_nodes_branch", "api_nodes", type_="foreignkey")
    op.drop_column("api_nodes", "branch_id")
