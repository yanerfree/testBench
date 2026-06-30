"""自定义 Mock 预设 CRUD"""
from __future__ import annotations

import uuid

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_preset import CustomMockPreset


async def list_presets(session: AsyncSession, mock_type: str) -> list[CustomMockPreset]:
    result = await session.execute(
        select(CustomMockPreset)
        .where(CustomMockPreset.mock_type == mock_type)
        .order_by(CustomMockPreset.created_at.desc())
    )
    return list(result.scalars().all())


async def create_preset(session: AsyncSession, mock_type: str, name: str, config: dict) -> CustomMockPreset:
    preset = CustomMockPreset(mock_type=mock_type, name=name, config=config)
    session.add(preset)
    await session.flush()
    await session.refresh(preset)
    return preset


async def delete_preset(session: AsyncSession, preset_id: uuid.UUID) -> bool:
    result = await session.execute(
        delete(CustomMockPreset).where(CustomMockPreset.id == preset_id)
    )
    return result.rowcount > 0
