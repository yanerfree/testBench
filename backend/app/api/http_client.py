"""HTTP 请求客户端 API — 请求集合管理 + 代理发送 + 历史"""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections import deque
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps.db import get_db
from app.models.http_request import HttpRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/http-client", tags=["http-client"])

_history: deque[dict] = deque(maxlen=200)


# ── Schemas ──

class RequestCreate(BaseModel):
    parent_id: str | None = None
    type: str = "request"
    name: str = "新请求"
    method: str = "GET"
    url: str = ""

class RequestUpdate(BaseModel):
    name: str | None = None
    method: str | None = None
    url: str | None = None
    headers: list | None = Field(default=None)
    body: str | None = Field(default=None)
    body_type: str | None = None
    auth_type: str | None = None
    auth_config: dict | None = Field(default=None)
    parent_id: str | None = Field(default=None)
    sort_order: int | None = None

class SendRequest(BaseModel):
    method: str = "GET"
    url: str
    headers: dict | None = None
    body: str | None = None
    timeout: int = Field(default=30, ge=1, le=120)


# ── 请求集合 CRUD ──

@router.get("/requests")
async def list_requests(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(HttpRequest).order_by(HttpRequest.sort_order, HttpRequest.created_at)
    )
    items = result.scalars().all()
    return {"data": [_to_dict(r) for r in items]}


@router.post("/requests", status_code=201)
async def create_request(body: RequestCreate, session: AsyncSession = Depends(get_db)):
    item = HttpRequest(
        type=body.type,
        name=body.name,
        parent_id=uuid.UUID(body.parent_id) if body.parent_id else None,
        method=body.method,
        url=body.url,
    )
    session.add(item)
    await session.flush()
    await session.refresh(item)
    return {"data": _to_dict(item)}


@router.put("/requests/{item_id}")
async def update_request(item_id: uuid.UUID, body: RequestUpdate, session: AsyncSession = Depends(get_db)):
    item = await session.get(HttpRequest, item_id)
    if not item:
        return JSONResponse({"error": "Not found"}, status_code=404)
    data = body.model_dump(exclude_unset=True)
    if "parent_id" in data:
        data["parent_id"] = uuid.UUID(data["parent_id"]) if data["parent_id"] else None
    for k, v in data.items():
        setattr(item, k, v)
    await session.flush()
    await session.refresh(item)
    return {"data": _to_dict(item)}


@router.delete("/requests/{item_id}")
async def delete_request(item_id: uuid.UUID, session: AsyncSession = Depends(get_db)):
    await session.execute(delete(HttpRequest).where(HttpRequest.parent_id == item_id))
    await session.execute(delete(HttpRequest).where(HttpRequest.id == item_id))
    return {"ok": True}


# ── 发送请求 ──

@router.post("/send")
async def send_request(req: SendRequest):
    try:
        headers = dict(req.headers) if req.headers else {}
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=req.timeout, follow_redirects=True, verify=False) as client:
            resp = await client.request(
                method=req.method.upper(),
                url=req.url,
                headers=headers,
                content=req.body.encode("utf-8") if req.body else None,
            )
        elapsed = round((time.perf_counter() - t0) * 1000, 1)
        resp_headers = dict(resp.headers)
        try:
            resp_body = resp.text
        except Exception:
            resp_body = f"[Binary {len(resp.content)} bytes]"

        actual_req_headers = dict(resp.request.headers) if resp.request else headers

        result = {
            "statusCode": resp.status_code,
            "headers": resp_headers,
            "body": resp_body[:200000],
            "elapsed": elapsed,
            "size": len(resp.content),
            "actualRequest": {
                "method": req.method.upper(),
                "url": str(resp.request.url) if resp.request else req.url,
                "headers": actual_req_headers,
                "body": req.body,
            },
        }

        _history.appendleft({
            "id": str(uuid.uuid4())[:8],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": req.method.upper(),
            "url": req.url,
            "statusCode": resp.status_code,
            "elapsed": elapsed,
            "size": len(resp.content),
        })

        return {"data": result}
    except httpx.ConnectError as e:
        return {"error": f"连接失败: {e}"}
    except httpx.TimeoutException:
        return {"error": f"请求超时 ({req.timeout}s)"}
    except Exception as e:
        return {"error": str(e)[:300]}


# ── 历史 ──

@router.get("/history")
async def get_history(limit: int = Query(50, ge=1, le=200)):
    return {"data": list(_history)[:limit], "total": len(_history)}


@router.delete("/history")
async def clear_history():
    _history.clear()
    return {"ok": True}


# ── 工具 ──

def _to_dict(r: HttpRequest) -> dict:
    return {
        "id": str(r.id),
        "parentId": str(r.parent_id) if r.parent_id else None,
        "type": r.type,
        "name": r.name,
        "sortOrder": r.sort_order,
        "method": r.method,
        "url": r.url,
        "headers": r.headers,
        "body": r.body,
        "bodyType": r.body_type,
        "authType": r.auth_type,
        "authConfig": r.auth_config,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
        "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
    }
