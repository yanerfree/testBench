"""接口测试 API — 场景 CRUD + AI 生成"""
from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import BaseSchema
from app.core.exceptions import NotFoundError
from app.deps.auth import get_current_user, require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.models.api_test import ApiTestScenario, ApiTestStep

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/projects/{project_id}/branches/{branch_id}/api-tests",
    tags=["api-test"],
)


def _scenario_to_dict(s: ApiTestScenario, steps: list[ApiTestStep] | None = None) -> dict:
    d = {
        "id": str(s.id),
        "code": s.code,
        "title": s.title,
        "priority": s.priority,
        "description": s.description,
        "status": s.status,
        "sourceApiIds": s.source_api_ids,
        "envVariables": s.env_variables,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }
    if steps is not None:
        d["steps"] = [_step_to_dict(st) for st in steps]
    return d


def _step_to_dict(st: ApiTestStep) -> dict:
    return {
        "id": str(st.id),
        "sortOrder": st.sort_order,
        "groupName": st.group_name,
        "name": st.name,
        "method": st.method,
        "url": st.url,
        "headers": st.headers,
        "body": st.body,
        "assertions": st.assertions,
        "variablesExtract": st.variables_extract,
        "lastStatus": st.last_status,
        "lastResponse": st.last_response,
    }


@router.get("")
async def list_scenarios(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(ApiTestScenario)
        .where(ApiTestScenario.project_id == project_id, ApiTestScenario.branch_id == branch_id)
        .order_by(ApiTestScenario.created_at.desc())
    )
    scenarios = result.scalars().all()
    return {"data": [_scenario_to_dict(s) for s in scenarios]}


@router.get("/{scenario_id}")
async def get_scenario(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario or scenario.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="场景不存在")

    steps_result = await session.execute(
        select(ApiTestStep)
        .where(ApiTestStep.scenario_id == scenario_id)
        .order_by(ApiTestStep.sort_order)
    )
    steps = steps_result.scalars().all()
    return {"data": _scenario_to_dict(scenario, steps)}


@router.delete("/{scenario_id}")
async def delete_scenario(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario or scenario.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="场景不存在")
    await session.delete(scenario)
    await session.commit()
    return {"data": {"deleted": True}}


class GenerateRequest(BaseSchema):
    api_info: str = Field(default="", max_length=10000)
    api_ids: list[str] | None = None
    env_variables: dict | None = None


@router.post("/generate")
async def generate_api_tests(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: GenerateRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    from app.services.ai_config_resolver import resolve_ai_config
    from app.core.exceptions import AppError

    ai_config = await resolve_ai_config(project_id, session)
    if not ai_config:
        raise AppError(code="AI_NOT_CONFIGURED", message="AI 服务未配置", status_code=503)

    from app.services.ai.api_test_generator import generate_api_test

    async def event_stream():
        try:
            async for event in generate_api_test(
                project_id=project_id,
                branch_id=branch_id,
                api_info=body.api_info,
                api_ids=body.api_ids,
                env_variables=body.env_variables,
                ai_config=ai_config,
                session=session,
                user_id=current_user.id,
            ):
                yield f"data: {json.dumps({'type': event.type, **event.data}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("generate_api_test failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:200]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
