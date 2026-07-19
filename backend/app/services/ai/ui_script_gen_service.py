"""UI 脚本生成服务 — MCP Agent 探索式生成 + 旧引擎兜底"""
from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.models.environment import EnvironmentVariable
from app.services import script_service

logger = logging.getLogger(__name__)


async def generate_ui_script(
    case_id: str,
    session: AsyncSession,
    env_id: str | None = None,
) -> dict:
    """MCP Agent 探索式生成 Playwright 脚本 → 保存"""
    case = await session.get(Case, uuid.UUID(case_id))
    if not case:
        raise ValueError(f"用例不存在: {case_id}")

    env_vars = await _load_env_vars(session, env_id)
    base_url = env_vars.get("BASE_URL", "")
    fixture_name = _detect_fixture(case.preconditions or "")
    creds = _get_credentials(env_vars, fixture_name)

    from app.services.ai.mcp_agent import run_mcp_agent, AgentConfig

    script_content = ""
    all_passed = False

    async for event in run_mcp_agent(
        test_case_title=case.title,
        test_steps=case.steps or [],
        expected_result=case.expected_result,
        preconditions=case.preconditions or "",
        base_url=base_url,
        env_vars=env_vars,
        credentials=creds,
        fixture_name=fixture_name,
    ):
        if event.event == "done":
            script_content = event.data.get("script_content", "")
            all_passed = event.data.get("all_passed", False)
        elif event.event == "error":
            raise ValueError(f"MCP Agent 生成失败: {event.data.get('content', '')}")

    if not script_content.strip():
        raise ValueError("MCP Agent 未生成有效脚本")

    script = await _save_script(session, case, script_content, all_passed)
    await session.flush()

    return {
        "script_id": str(script.id),
        "content": script_content,
        "case_id": case_id,
        "version": script.version,
    }


async def generate_ui_script_stream(
    case_id: str,
    session: AsyncSession,
    env_id: str | None = None,
    step_hints: dict | None = None,
) -> AsyncGenerator[str, None]:
    """SSE 流式 MCP Agent 生成 — 实时推送进度。"""
    case = await session.get(Case, uuid.UUID(case_id))
    if not case:
        yield _sse("error", {"error": "用例不存在"})
        return

    env_vars = await _load_env_vars(session, env_id)
    base_url = env_vars.get("BASE_URL", "")
    fixture_name = _detect_fixture(case.preconditions or "")
    creds = _get_credentials(env_vars, fixture_name)

    from app.services.ai.mcp_agent import run_mcp_agent

    script_content = ""
    all_passed = False

    try:
        async for event in run_mcp_agent(
            test_case_title=case.title,
            test_steps=case.steps or [],
            expected_result=case.expected_result,
            preconditions=case.preconditions or "",
            base_url=base_url,
            env_vars=env_vars,
            credentials=creds,
            fixture_name=fixture_name,
        ):
            if event.event == "done":
                script_content = event.data.get("script_content", "")
                all_passed = event.data.get("all_passed", False)
            elif event.event == "error":
                yield _sse("error", {"error": event.data.get("content", "未知错误")})
                return
            else:
                yield _sse(event.event, event.data)

        if script_content.strip():
            script = await _save_script(session, case, script_content, all_passed)
            case.ui_scenario_status = "completed" if all_passed else "debugging"
            if not case.ui_scenario:
                case.ui_scenario = {}
            case.ui_scenario = {
                **case.ui_scenario,
                "steps": [
                    {"seq": j + 1, "action": s.get("action", ""), "expected": s.get("expected", "")}
                    for j, s in enumerate(case.steps or [])
                ],
                "scriptId": str(script.id),
            }
            await session.commit()

            yield _sse("done", {
                "status": "passed" if all_passed else "failed",
                "all_passed": all_passed,
                "results": [],
                "captured_requests": [],
            })
        else:
            yield _sse("error", {"error": "Agent 未生成脚本"})

    except Exception as exc:
        logger.error("generate_ui_script_stream error", exc_info=True)
        yield _sse("error", {"error": str(exc)[:300]})


# ─── 内部工具函数 ──────────────────────────────────────────

async def _load_env_vars(session: AsyncSession, env_id: str | None) -> dict[str, str]:
    if not env_id:
        return {}
    rows = await session.execute(
        select(EnvironmentVariable)
        .where(EnvironmentVariable.environment_id == uuid.UUID(env_id))
    )
    return {v.key: v.value for v in rows.scalars().all()}


async def _save_script(session: AsyncSession, case: Case, content: str, all_passed: bool):
    """转正状态机：通过 → active，失败 → draft（不覆盖已有好脚本）"""
    file_name = f"test_{case.case_code.lower().replace('-', '_')}_ui.py"
    if all_passed:
        return await script_service.create_script(
            session, case_id=case.id, script_type="ui", content=content,
            file_name=file_name, language="python", source="ai_generated",
        )
    existing = await script_service.get_active_script(session, case.id, "ui")
    if existing:
        from sqlalchemy import func as sa_func
        from app.models.script import Script
        max_ver_result = await session.execute(
            select(Script.version).where(Script.case_id == case.id, Script.script_type == "ui")
            .order_by(Script.version.desc()).limit(1)
        )
        max_ver = max_ver_result.scalar_one_or_none() or 0
        script = Script(
            case_id=case.id, script_type="ui", version=max_ver + 1,
            language="python", content=content,
            file_name=file_name, status="draft", source="ai_generated",
        )
        session.add(script)
        await session.flush()
        return script
    return await script_service.create_script(
        session, case_id=case.id, script_type="ui", content=content,
        file_name=file_name, language="python", source="ai_generated",
    )


async def repair_ui_script(
    case_id: str,
    session: AsyncSession,
    error_summary: str,
    stdout: str = "",
) -> dict:
    """分析执行失败原因，读取调试历史，修复脚本。"""
    from sqlalchemy import select as sa_select
    from app.models.script import ScriptRun
    from app.services.ai.llm_client import complete

    case = await session.get(Case, uuid.UUID(case_id))
    if not case:
        raise ValueError(f"用例不存在: {case_id}")

    current_script = await script_service.get_active_script(session, case.id, "ui")
    if not current_script:
        raise ValueError("没有可修复的 UI 脚本")

    runs_result = await session.execute(
        sa_select(ScriptRun)
        .where(ScriptRun.case_id == case.id, ScriptRun.script_type == "ui", ScriptRun.status != "passed")
        .order_by(ScriptRun.created_at.desc())
        .limit(5)
    )
    history = [{"error": r.error_summary or "", "stdout_tail": (r.stdout or "")[-500:]} for r in runs_result.scalars().all()]

    from app.services.ai.prompts.ui_script_repair import REPAIR_SYSTEM_PROMPT, get_repair_prompt
    messages = [
        {"role": "system", "content": REPAIR_SYSTEM_PROMPT},
        {"role": "user", "content": get_repair_prompt(current_script.content, error_summary, stdout, history)},
    ]

    resp = await complete(messages, max_tokens=4096, temperature=0.1)
    fixed_content = _extract_code(resp.content)

    if fixed_content == current_script.content:
        return {"changed": False, "message": "AI 未找到可修复的内容"}

    script = await script_service.create_script(
        session, case_id=case.id, script_type="ui", content=fixed_content,
        file_name=current_script.file_name, language="python", source="ai_generated",
    )
    await session.flush()
    return {"changed": True, "script_id": str(script.id), "version": script.version}


def _detect_fixture(preconditions: str) -> str:
    """从前置条件文本自动检测应该用哪个 fixture"""
    text = preconditions.lower()
    if any(kw in text for kw in ["租户", "tenant", "已授权"]):
        return "tenant_page"
    return "logged_in_page"


def _get_credentials(env_vars: dict, fixture_name: str) -> dict:
    """根据 fixture 名称获取对应的登录凭据"""
    if fixture_name == "tenant_page":
        return {
            "username": env_vars.get("TENANT_USERNAME", env_vars.get("ADMIN_USERNAME", "")),
            "password": env_vars.get("TENANT_PASSWORD", env_vars.get("ADMIN_PASSWORD", "")),
        }
    return {
        "username": env_vars.get("ADMIN_USERNAME", ""),
        "password": env_vars.get("ADMIN_PASSWORD", ""),
    }


def _sse(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _extract_code(text: str) -> str:
    """从 LLM 响应中提取 Python 代码"""
    match = re.search(r"```(?:python)?\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    for pattern in (r"^import ", r"^from "):
        m = re.search(pattern, text, re.MULTILINE)
        if m:
            return text[m.start():].strip()
    return text.strip()
