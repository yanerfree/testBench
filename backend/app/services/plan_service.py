"""测试计划服务"""
import uuid

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.audit import audit_log
from app.models.plan import Plan, PlanCase


@audit_log(action="create", target_type="plan")
async def create_plan(
    session: AsyncSession,
    project_id: uuid.UUID,
    created_by: uuid.UUID,
    name: str,
    plan_type: str,
    test_type: str,
    case_ids: list[uuid.UUID],
    environment_id: uuid.UUID | None = None,
    channel_id: uuid.UUID | None = None,
    retry_count: int = 0,
    circuit_breaker: dict | None = None,
) -> Plan:
    """创建测试计划 + 关联用例。"""
    if not case_ids:
        raise ValidationError(code="NO_CASES", message="用例集不能为空")
    if len(case_ids) > 1000:
        raise ValidationError(code="TOO_MANY_CASES", message="单个计划最多 1000 条用例")

    plan = Plan(
        project_id=project_id,
        name=name,
        plan_type=plan_type,
        test_type=test_type,
        environment_id=environment_id,
        channel_id=channel_id,
        retry_count=retry_count,
        circuit_breaker=circuit_breaker or {"consecutive": 5, "rate": 50},
        created_by=created_by,
    )
    session.add(plan)
    await session.flush()

    for i, cid in enumerate(case_ids):
        session.add(PlanCase(plan_id=plan.id, case_id=cid, sort_order=i))
    await session.flush()
    await session.refresh(plan)
    return plan


async def list_plans(
    session: AsyncSession,
    project_id: uuid.UUID,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """查询计划列表（含用例数）。"""
    base = select(Plan).where(Plan.project_id == project_id)
    if status:
        base = base.where(Plan.status == status)

    count_result = await session.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    stmt = base.order_by(Plan.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(stmt)
    plans = result.scalars().all()

    # 查每个计划的用例数
    items = []
    for p in plans:
        case_count_r = await session.execute(
            select(func.count()).where(PlanCase.plan_id == p.id)
        )
        items.append({
            "plan": p,
            "case_count": case_count_r.scalar_one(),
        })
    return items, total


async def get_plan(session: AsyncSession, plan_id: uuid.UUID) -> Plan:
    result = await session.execute(select(Plan).where(Plan.id == plan_id))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError(code="PLAN_NOT_FOUND", message="计划不存在")
    return plan


async def get_plan_cases(session: AsyncSession, plan_id: uuid.UUID) -> list[PlanCase]:
    result = await session.execute(
        select(PlanCase).where(PlanCase.plan_id == plan_id).order_by(PlanCase.sort_order)
    )
    return list(result.scalars().all())


@audit_log(action="archive", target_type="plan")
async def archive_plan(session: AsyncSession, plan_id: uuid.UUID) -> Plan:
    plan = await get_plan(session, plan_id)
    if plan.status not in ("completed", "draft"):
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可归档")
    plan.status = "archived"
    await session.flush()
    await session.refresh(plan)
    return plan


@audit_log(action="delete", target_type="plan")
async def delete_plan(session: AsyncSession, plan_id: uuid.UUID) -> None:
    plan = await get_plan(session, plan_id)
    if plan.status not in ("archived", "draft"):
        raise ValidationError(code="INVALID_STATUS", message="仅草稿或已归档的计划可删除")
    await session.execute(delete(PlanCase).where(PlanCase.plan_id == plan_id))
    await session.delete(plan)
    await session.flush()


@audit_log(action="reopen", target_type="plan")
async def reopen_plan(session: AsyncSession, plan_id: uuid.UUID) -> Plan:
    """重新打开已完成的计划，状态改为 executing，已有结果保留。"""
    plan = await get_plan(session, plan_id)
    if plan.status != "completed":
        raise ValidationError(code="INVALID_STATUS", message=f"当前状态「{plan.status}」不可重新打开，仅已完成的计划可重新打开")
    plan.status = "executing"
    await session.flush()
    await session.refresh(plan)
    return plan
