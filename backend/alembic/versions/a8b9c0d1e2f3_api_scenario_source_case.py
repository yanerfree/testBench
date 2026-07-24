"""api_test_scenarios.source_case_id (link back to source case for shared scenario variables)

Revision ID: a8b9c0d1e2f3
Revises: f7a1c2b3d4e5
Create Date: 2026-07-24

给接口测试场景加 source_case_id：从功能用例「编排为接口测试」时回填，
运行时据此解析该用例的场景变量并以 ${SV_*} 注入，实现 UI/接口共用一份场景变量。
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a8b9c0d1e2f3"
down_revision = "f7a1c2b3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_test_scenarios",
        sa.Column("source_case_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_api_scenario_source_case",
        "api_test_scenarios",
        "cases",
        ["source_case_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_api_scenario_source_case", "api_test_scenarios", type_="foreignkey")
    op.drop_column("api_test_scenarios", "source_case_id")
