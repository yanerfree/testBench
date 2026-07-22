"""add case status v2 (lifecycle + unified manual/ui/api dimension status)

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa

revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("lifecycle_status", sa.String(length=20), nullable=False, server_default="draft"))
    op.add_column("cases", sa.Column("manual_status", sa.String(length=20), nullable=False, server_default="not_started"))
    op.add_column("cases", sa.Column("ui_status", sa.String(length=20), nullable=False, server_default="not_started"))
    op.add_column("cases", sa.Column("api_status", sa.String(length=20), nullable=False, server_default="not_started"))

    # 回填：整体生命周期 ← automation_status
    op.execute("""
        UPDATE cases SET lifecycle_status = CASE
            WHEN automation_status = 'automated' THEN 'done'
            WHEN automation_status = 'archived' THEN 'deprecated'
            ELSE 'draft' END
    """)
    # 回填：手动 ← 是否有步骤
    op.execute("""
        UPDATE cases SET manual_status = CASE
            WHEN steps IS NOT NULL AND jsonb_array_length(steps) > 0 THEN 'draft'
            ELSE 'not_started' END
    """)
    # 回填：UI/接口 ← scenario_status + review_status
    for dim, sc in (("ui_status", "ui_scenario_status"), ("api_status", "api_scenario_status")):
        op.execute(f"""
            UPDATE cases SET {dim} = CASE
                WHEN {sc} = 'debugging' THEN 'debugging'
                WHEN {sc} = 'completed' AND review_status = 'approved' THEN 'executable'
                WHEN {sc} = 'completed' AND review_status = 'rejected' THEN 'needs_fix'
                WHEN {sc} = 'completed' THEN 'pending_review'
                WHEN {sc} = 'draft' THEN 'draft'
                ELSE 'not_started' END
        """)


def downgrade() -> None:
    op.drop_column("cases", "api_status")
    op.drop_column("cases", "ui_status")
    op.drop_column("cases", "manual_status")
    op.drop_column("cases", "lifecycle_status")
