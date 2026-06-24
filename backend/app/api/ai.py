"""AI 生成接口 — 用例生成 / 脚本生成 / 文档生成（SSE 流式）"""
from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AppError
from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.schemas.ai import (
    AIConfigResponse,
    ApplyCasesRequest,
    GenerateCasesRequest,
    GenerateScriptRequest,
)
from app.services.ai import llm_client

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/projects/{project_id}/branches/{branch_id}/ai",
    tags=["ai"],
)

config_router = APIRouter(prefix="/api/ai", tags=["ai"])


def _check_ai_enabled():
    if not settings.ai_enabled:
        raise AppError(code="AI_DISABLED", message="AI 功能未启用，请在系统配置中开启", status_code=503)
    if not settings.ai_base_url:
        raise AppError(code="AI_NOT_CONFIGURED", message="AI 服务地址未配置", status_code=503)


@config_router.get("/config")
async def get_ai_config() -> dict:
    base_url = settings.ai_base_url
    if base_url and len(base_url) > 20:
        masked = base_url[:15] + "..." + base_url[-5:]
    else:
        masked = base_url or ""
    return {
        "data": AIConfigResponse(
            enabled=settings.ai_enabled,
            provider=settings.ai_provider,
            model=settings.ai_model,
            base_url_masked=masked,
        ).model_dump(by_alias=True)
    }


@router.post("/generate-cases")
async def generate_cases(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: GenerateCasesRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    _check_ai_enabled()

    from app.services.ai.case_gen_service import build_case_gen_messages
    messages = build_case_gen_messages(
        interface_info=body.interface_info,
        business_rules=body.business_rules,
        module=body.target.module,
        submodule=body.target.submodule,
    )

    async def event_stream():
        full_content = ""
        try:
            async for chunk in llm_client.stream(
                messages,
                model=body.model,
                temperature=body.temperature,
            ):
                if chunk.delta:
                    full_content += chunk.delta
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk.delta}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'content': full_content}, ensure_ascii=False)}\n\n"
        except llm_client.LLMError as e:
            logger.error("AI generate-cases failed: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("Unexpected error in generate-cases")
            yield f"data: {json.dumps({'type': 'error', 'message': '生成失败，请稍后重试'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/generate-script")
async def generate_script(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: GenerateScriptRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    _check_ai_enabled()

    from app.services.ai.script_gen_service import build_script_gen_messages
    messages = await build_script_gen_messages(
        case_ids=body.case_ids,
        script_type=body.script_type,
        session=session,
    )

    async def event_stream():
        full_content = ""
        try:
            async for chunk in llm_client.stream(
                messages,
                model=body.model,
                temperature=body.temperature,
            ):
                if chunk.delta:
                    full_content += chunk.delta
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk.delta}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'content': full_content}, ensure_ascii=False)}\n\n"
        except llm_client.LLMError as e:
            logger.error("AI generate-script failed: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("Unexpected error in generate-script")
            yield f"data: {json.dumps({'type': 'error', 'message': '生成失败，请稍后重试'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/apply-cases")
async def apply_cases(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    body: ApplyCasesRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    _check_ai_enabled()

    from app.services.ai.case_gen_service import import_generated_cases
    result = await import_generated_cases(
        cases=body.cases,
        project_id=project_id,
        branch_id=branch_id,
        folder_id=uuid.UUID(body.folder_id) if body.folder_id else None,
        user_id=current_user.id,
        session=session,
    )
    return {"data": result}
