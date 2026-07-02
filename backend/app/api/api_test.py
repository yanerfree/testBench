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
from app.models.api_test_folder import ApiTestFolder

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
        "source": s.source,
        "preSteps": s.pre_steps,
        "folderId": str(s.folder_id) if s.folder_id else None,
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
        "enabled": st.enabled,
        "preScript": st.pre_script,
        "postScript": st.post_script,
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


# ── 文件夹管理（必须在 /{scenario_id} 之前） ──

@router.get("/folders")
async def list_api_test_folders(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await session.execute(
        select(ApiTestFolder).where(ApiTestFolder.branch_id == branch_id).order_by(ApiTestFolder.sort_order)
    )
    all_folders = result.scalars().all()

    sc_all = await session.execute(select(ApiTestScenario.folder_id).where(ApiTestScenario.branch_id == branch_id))
    scenario_counts = {}
    for (fid,) in sc_all:
        if fid:
            scenario_counts[fid] = scenario_counts.get(fid, 0) + 1

    def build_tree(parent_id=None):
        children = [f for f in all_folders if f.parent_id == parent_id]
        return [{
            "id": str(f.id),
            "name": f.name,
            "parentId": str(f.parent_id) if f.parent_id else None,
            "scenarioCount": scenario_counts.get(f.id, 0),
            "children": build_tree(f.id),
        } for f in children]

    return {"data": build_tree()}


@router.post("/folders")
async def create_api_test_folder(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    name: str,
    parent_id: str | None = None,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    folder = ApiTestFolder(
        branch_id=branch_id,
        name=name,
        parent_id=uuid.UUID(parent_id) if parent_id else None,
    )
    session.add(folder)
    await session.commit()
    return {"data": {"id": str(folder.id), "name": folder.name}}


@router.delete("/folders/{folder_id}")
async def delete_api_test_folder(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    folder_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    children = await session.execute(select(ApiTestFolder).where(ApiTestFolder.parent_id == folder_id))
    if children.scalars().first():
        from app.core.exceptions import AppError
        raise AppError(code="HAS_CHILDREN", message="该文件夹下有子文件夹，请先删除", status_code=400)
    sc = await session.execute(select(ApiTestScenario).where(ApiTestScenario.folder_id == folder_id).limit(1))
    if sc.scalars().first():
        from app.core.exceptions import AppError
        raise AppError(code="HAS_SCENARIOS", message="该文件夹下有测试场景，请先移动或删除", status_code=400)
    folder = await session.get(ApiTestFolder, folder_id)
    if folder:
        await session.delete(folder)
        await session.commit()
    return {"data": {"deleted": True}}


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


class UpdateScenarioRequest(BaseSchema):
    title: str | None = None
    status: str | None = None
    priority: str | None = None
    description: str | None = None
    pre_steps: dict | None = None
    folder_id: str | None = None


@router.put("/{scenario_id}")
async def update_scenario(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    body: UpdateScenarioRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario or scenario.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="场景不存在")
    if body.title is not None: scenario.title = body.title
    if body.status is not None: scenario.status = body.status
    if body.priority is not None: scenario.priority = body.priority
    if body.description is not None: scenario.description = body.description
    if body.pre_steps is not None: scenario.pre_steps = body.pre_steps
    if body.folder_id is not None: scenario.folder_id = uuid.UUID(body.folder_id) if body.folder_id else None
    await session.commit()
    return {"data": _scenario_to_dict(scenario)}


class UpdateStepRequest(BaseSchema):
    name: str | None = None
    method: str | None = None
    url: str | None = None
    headers: dict | None = None
    body: dict | None = None
    assertions: list | None = None
    variables_extract: dict | None = None
    enabled: bool | None = None
    group_name: str | None = None
    pre_script: dict | None = None
    post_script: dict | None = None


@router.put("/{scenario_id}/steps/{step_id}")
async def update_step(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    step_id: uuid.UUID,
    body: UpdateStepRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    step = await session.get(ApiTestStep, step_id)
    if not step or step.scenario_id != scenario_id:
        raise NotFoundError(code="NOT_FOUND", message="步骤不存在")
    for field in ['name', 'method', 'url', 'headers', 'body', 'assertions', 'variables_extract', 'enabled', 'group_name', 'pre_script', 'post_script']:
        val = getattr(body, field, None)
        if val is not None:
            setattr(step, field, val)
    await session.commit()
    return {"data": _step_to_dict(step)}


class CreateStepRequest(BaseSchema):
    name: str = Field(..., min_length=1)
    method: str = Field(default="GET")
    url: str = Field(default="")


@router.post("/{scenario_id}/steps")
async def create_step(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    body: CreateStepRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario or scenario.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="场景不存在")
    max_order = await session.execute(
        select(select(ApiTestStep.sort_order).where(ApiTestStep.scenario_id == scenario_id).correlate(None).scalar_subquery())
    )
    # 简单方式：取最大 sort_order + 1
    from sqlalchemy import func as sa_func
    max_result = await session.execute(
        select(sa_func.max(ApiTestStep.sort_order)).where(ApiTestStep.scenario_id == scenario_id)
    )
    next_order = (max_result.scalar() or 0) + 1

    step = ApiTestStep(
        scenario_id=scenario_id,
        sort_order=next_order,
        name=body.name,
        method=body.method,
        url=body.url,
    )
    session.add(step)
    await session.commit()
    return {"data": _step_to_dict(step)}


@router.delete("/{scenario_id}/steps/{step_id}")
async def delete_step(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    step_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    step = await session.get(ApiTestStep, step_id)
    if not step or step.scenario_id != scenario_id:
        raise NotFoundError(code="NOT_FOUND", message="步骤不存在")
    await session.delete(step)
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


@router.post("/{scenario_id}/run-step/{step_id}")
async def run_step(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    scenario_id: uuid.UUID,
    step_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """执行单个测试步骤 — 发送 HTTP 请求并返回结果"""
    import httpx
    import time
    import re

    scenario = await session.get(ApiTestScenario, scenario_id)
    if not scenario or scenario.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="场景不存在")

    step = await session.get(ApiTestStep, step_id)
    if not step or step.scenario_id != scenario_id:
        raise NotFoundError(code="NOT_FOUND", message="步骤不存在")

    # 替换环境变量
    env = scenario.env_variables or {}
    # 从同场景已执行步骤中收集提取的变量
    steps_result = await session.execute(
        select(ApiTestStep)
        .where(ApiTestStep.scenario_id == scenario_id, ApiTestStep.last_response != None)
        .order_by(ApiTestStep.sort_order)
    )
    for prev in steps_result.scalars().all():
        if prev.variables_extract and prev.last_response:
            resp_body = prev.last_response.get("body", {})
            for var_name, path in prev.variables_extract.items():
                val = resp_body
                for key in path.split("."):
                    if isinstance(val, dict):
                        val = val.get(key)
                    else:
                        val = None
                        break
                if val is not None:
                    env[var_name] = str(val)

    def resolve(text):
        if not isinstance(text, str):
            return text
        def replacer(m):
            return env.get(m.group(1), m.group(0))
        return re.sub(r'\$\{(\w+)\}', replacer, text)

    def resolve_obj(obj):
        if isinstance(obj, str):
            return resolve(obj)
        if isinstance(obj, dict):
            return {k: resolve_obj(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [resolve_obj(v) for v in obj]
        return obj

    url = resolve(step.url)
    headers = resolve_obj(step.headers or {})
    body = resolve_obj(step.body)

    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.request(
                method=step.method,
                url=url,
                headers=headers,
                json=body if body else None,
            )
        duration = int((time.time() - start) * 1000)

        try:
            resp_body = resp.json()
        except Exception:
            resp_body = resp.text[:2000]

        # 检查断言
        assertion_results = []
        all_pass = True
        for a in (step.assertions or []):
            passed = False
            a_type = a.get("type")
            operator = a.get("operator", "==")
            expected = a.get("value")
            field = a.get("field")

            if a_type == "status":
                actual = resp.status_code
                if operator == "==":
                    passed = actual == expected
                elif operator == "in":
                    passed = actual in (expected if isinstance(expected, list) else [expected])
            elif a_type == "body_contains":
                actual = str(resp_body)
                passed = str(expected) in actual
            elif a_type == "body_field":
                actual = resp_body
                if field:
                    for key in field.split("."):
                        if isinstance(actual, dict):
                            actual = actual.get(key)
                        else:
                            actual = None
                            break
                if operator == "==":
                    passed = actual == expected
                elif operator == "not_empty":
                    passed = actual is not None and actual != ""

            if not passed:
                all_pass = False
            assertion_results.append({**a, "passed": passed})

        # 保存结果
        step.last_status = "pass" if all_pass else "fail"
        step.last_response = {
            "statusCode": resp.status_code,
            "duration": duration,
            "body": resp_body if isinstance(resp_body, (dict, list)) else {"_text": resp_body},
            "assertions": assertion_results,
        }
        await session.commit()

        return {"data": step.last_response}

    except Exception as e:
        step.last_status = "fail"
        step.last_response = {"error": str(e)[:500]}
        await session.commit()
        return {"data": step.last_response}
