"""MCP API Key 管理 — 生成/列表/吊销"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.db import get_db
from app.deps.auth import get_current_user
from app.models.user import User
from app.models.mcp_api_key import McpApiKey

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp-keys", tags=["mcp-keys"])


class CreateKeyRequest(BaseModel):
    name: str = Field(default="default", max_length=100)


@router.post("")
async def create_api_key(
    body: CreateKeyRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw_key = f"tb_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    api_key = McpApiKey(
        user_id=current_user.id,
        name=body.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
    )
    session.add(api_key)
    await session.commit()

    return {"data": {
        "id": str(api_key.id),
        "name": api_key.name,
        "key": raw_key,
        "prefix": key_prefix,
        "createdAt": api_key.created_at.isoformat(),
    }}


@router.get("")
async def list_api_keys(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(McpApiKey)
        .where(McpApiKey.user_id == current_user.id, McpApiKey.is_active == True)
        .order_by(McpApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return {"data": [{
        "id": str(k.id),
        "name": k.name,
        "prefix": k.key_prefix,
        "createdAt": k.created_at.isoformat(),
        "lastUsedAt": k.last_used_at.isoformat() if k.last_used_at else None,
    } for k in keys]}


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    key = await session.get(McpApiKey, key_id)
    if not key or key.user_id != current_user.id:
        return {"error": "Key not found"}
    key.is_active = False
    await session.commit()
    return {"data": {"revoked": True}}
