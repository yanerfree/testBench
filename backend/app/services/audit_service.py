"""审计日志查询 service。"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


async def list_logs(
    session: AsyncSession,
    *,
    project_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    target_type: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """
    查询审计日志，返回 (items, total)。

    items 包含 username（JOIN users 表）。
    默认查询最近 7 天。
    """
    # 默认时间范围：最近 7 天
    if start_time is None and end_time is None:
        start_time = datetime.now(timezone.utc) - timedelta(days=7)

    # 基础查询
    base = (
        select(
            AuditLog,
            User.username.label("username"),
        )
        .outerjoin(User, AuditLog.user_id == User.id)
    )

    # 筛选条件
    if project_id is not None:
        base = base.where(AuditLog.project_id == project_id)
    if user_id is not None:
        base = base.where(AuditLog.user_id == user_id)
    if action is not None:
        base = base.where(AuditLog.action == action)
    if target_type is not None:
        base = base.where(AuditLog.target_type == target_type)
    if start_time is not None:
        base = base.where(AuditLog.created_at >= start_time)
    if end_time is not None:
        base = base.where(AuditLog.created_at <= end_time)
    if keyword is not None:
        base = base.where(AuditLog.target_name.ilike(f"%{keyword}%"))

    # 计算总数
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar_one()

    # 分页查询
    offset = (page - 1) * page_size
    data_stmt = (
        base
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await session.execute(data_stmt)).all()

    items = []
    for row in rows:
        log = row[0]  # AuditLog object
        username = row[1]  # username from JOIN
        items.append({
            "id": log.id,
            "user_id": log.user_id,
            "username": username,
            "project_id": log.project_id,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "target_name": log.target_name,
            "changes": log.changes,
            "trace_id": log.trace_id,
            "created_at": log.created_at,
        })

    return items, total
