"""Load Test 数据库操作 Service"""
from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.load_test import LoadTestRun, LoadTestScenario, LoadTestStep
from app.schemas.load_test import (
    LoadTestScenarioCreate,
    LoadTestScenarioUpdate,
    LoadTestStepCreate,
    LoadTestStepUpdate,
)


# ───── Scenario CRUD ─────

async def list_scenarios(session: AsyncSession) -> list[LoadTestScenario]:
    result = await session.execute(
        select(LoadTestScenario).order_by(LoadTestScenario.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_scenario(session: AsyncSession, scenario_id: uuid.UUID) -> LoadTestScenario | None:
    return await session.get(LoadTestScenario, scenario_id)


async def create_scenario(session: AsyncSession, data: LoadTestScenarioCreate) -> LoadTestScenario:
    scenario = LoadTestScenario(**data.model_dump())
    session.add(scenario)
    await session.flush()
    await session.refresh(scenario)
    return scenario


async def update_scenario(
    session: AsyncSession, scenario_id: uuid.UUID, data: LoadTestScenarioUpdate
) -> LoadTestScenario | None:
    scenario = await session.get(LoadTestScenario, scenario_id)
    if not scenario:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(scenario, k, v)
    await session.flush()
    await session.refresh(scenario)
    return scenario


async def delete_scenario(session: AsyncSession, scenario_id: uuid.UUID) -> bool:
    scenario = await session.get(LoadTestScenario, scenario_id)
    if not scenario:
        return False
    await session.execute(delete(LoadTestStep).where(LoadTestStep.scenario_id == scenario_id))
    await session.execute(delete(LoadTestRun).where(LoadTestRun.scenario_id == scenario_id))
    await session.delete(scenario)
    await session.flush()
    return True


# ───── Step CRUD ─────

async def list_steps(session: AsyncSession, scenario_id: uuid.UUID) -> list[LoadTestStep]:
    result = await session.execute(
        select(LoadTestStep)
        .where(LoadTestStep.scenario_id == scenario_id)
        .order_by(LoadTestStep.sort_order, LoadTestStep.created_at)
    )
    return list(result.scalars().all())


async def get_step(session: AsyncSession, step_id: uuid.UUID) -> LoadTestStep | None:
    return await session.get(LoadTestStep, step_id)


async def create_step(session: AsyncSession, scenario_id: uuid.UUID, data: LoadTestStepCreate) -> LoadTestStep:
    max_order = await session.scalar(
        select(func.coalesce(func.max(LoadTestStep.sort_order), -1))
        .where(LoadTestStep.scenario_id == scenario_id)
    )
    step = LoadTestStep(**data.model_dump(), scenario_id=scenario_id, sort_order=max_order + 1)
    session.add(step)
    await session.flush()
    await session.refresh(step)
    return step


async def update_step(session: AsyncSession, step_id: uuid.UUID, data: LoadTestStepUpdate) -> LoadTestStep | None:
    step = await session.get(LoadTestStep, step_id)
    if not step:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(step, k, v)
    await session.flush()
    await session.refresh(step)
    return step


async def delete_step(session: AsyncSession, step_id: uuid.UUID) -> bool:
    step = await session.get(LoadTestStep, step_id)
    if not step:
        return False
    await session.delete(step)
    await session.flush()
    return True


async def reorder_steps(session: AsyncSession, items: list[dict]) -> None:
    for item in items:
        await session.execute(
            update(LoadTestStep).where(LoadTestStep.id == item["id"]).values(sort_order=item["sort_order"])
        )
    await session.flush()


# ───── Run CRUD ─────

async def list_runs(
    session: AsyncSession, scenario_id: uuid.UUID, *, limit: int = 20
) -> list[LoadTestRun]:
    result = await session.execute(
        select(LoadTestRun)
        .where(LoadTestRun.scenario_id == scenario_id)
        .order_by(LoadTestRun.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_run(session: AsyncSession, run_id: uuid.UUID) -> LoadTestRun | None:
    return await session.get(LoadTestRun, run_id)


async def create_run(session: AsyncSession, data: dict) -> LoadTestRun:
    run = LoadTestRun(**data)
    session.add(run)
    await session.flush()
    await session.refresh(run)
    return run


async def update_run(session: AsyncSession, run_id: uuid.UUID, updates: dict) -> None:
    await session.execute(
        update(LoadTestRun).where(LoadTestRun.id == run_id).values(**updates)
    )
    await session.flush()


async def delete_run(session: AsyncSession, run_id: uuid.UUID) -> bool:
    run = await session.get(LoadTestRun, run_id)
    if not run:
        return False
    await session.delete(run)
    await session.flush()
    return True
