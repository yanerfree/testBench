"""add api_nodes table

Revision ID: a2b3c4d5e6f7
Revises: f5b8d2a1c3e7
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a2b3c4d5e6f7"
down_revision = "f5b8d2a1c3e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("node_type", sa.String(20), nullable=False, server_default="endpoint"),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("method", sa.String(10), nullable=True),
        sa.Column("url", sa.String(2000), nullable=True),
        sa.Column("params", postgresql.JSONB(), nullable=True),
        sa.Column("headers", postgresql.JSONB(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("body_type", sa.String(20), nullable=True, server_default="json"),
        sa.Column("auth", postgresql.JSONB(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["api_nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_api_nodes_project_id", "api_nodes", ["project_id"])
    op.create_index("ix_api_nodes_parent_id", "api_nodes", ["parent_id"])


def downgrade() -> None:
    op.drop_index("ix_api_nodes_parent_id")
    op.drop_index("ix_api_nodes_project_id")
    op.drop_table("api_nodes")
