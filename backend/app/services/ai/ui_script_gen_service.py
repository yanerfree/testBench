"""UI 脚本生成服务 — 深度探测 + 基于真实页面结构生成脚本"""
from __future__ import annotations

import logging
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case import Case
from app.models.environment import EnvironmentVariable
from app.services import script_service
from app.services.ai.llm_client import complete
from app.services.ai.prompts.ui_script_generation import get_system_prompt, get_user_prompt

logger = logging.getLogger(__name__)


async def generate_ui_script(
    case_id: str,
    session: AsyncSession,
    env_id: str | None = None,
) -> dict:
    """深度探测目标页面 → 基于真实结构生成 Playwright 脚本 → 保存"""
    case = await session.get(Case, uuid.UUID(case_id))
    if not case:
        raise ValueError(f"用例不存在: {case_id}")

    # 读环境变量
    env_vars = {}
    if env_id:
        rows = await session.execute(
            select(EnvironmentVariable)
            .where(EnvironmentVariable.environment_id == uuid.UUID(env_id))
        )
        env_vars = {v.key: v.value for v in rows.scalars().all()}

    base_url = env_vars.get("BASE_URL", "")
    env_vars_text = _format_env_vars(env_vars)

    # 解析前置条件，确定用哪个 fixture
    fixture_name = _detect_fixture(case.preconditions or "")
    creds = _get_credentials(env_vars, fixture_name)
    alt_fixture = "tenant_page" if fixture_name == "logged_in_page" else "logged_in_page"
    alt_creds = _get_credentials(env_vars, alt_fixture)

    # 逐步生成：一步一步生成+执行，每步基于真实页面
    import anyio
    from app.services.ai.step_generator import step_by_step_generate

    # 查历史修复记录
    healing_history = []
    try:
        from app.models.healing_archive import HealingArchive
        ha_result = await session.execute(
            select(HealingArchive).where(HealingArchive.case_id == case.id)
            .order_by(HealingArchive.created_at.desc()).limit(20)
        )
        healing_history = [
            {"step_seq": h.step_seq, "page_url": h.page_url, "original_code": h.original_code, "resolved": h.resolved}
            for h in ha_result.scalars().all()
        ]
    except Exception:
        pass

    gen_result = await anyio.to_thread.run_sync(lambda: step_by_step_generate(
        base_url=base_url,
        credentials=creds,
        steps=case.steps or [],
        fixture_name=fixture_name,
        healing_history=healing_history,
        preconditions=case.preconditions or "",
        headless=False,
        alt_credentials=alt_creds,
    ))

    script_content = gen_result.get("script", "")
    if not script_content.strip():
        raise ValueError("逐步生成失败，未生成有效脚本")

    # 保存 — 转正状态机：通过 → active，失败 → draft（不覆盖已有好脚本）
    all_passed = gen_result.get("all_passed", False)
    if all_passed:
        script = await script_service.create_script(
            session, case_id=case.id, script_type="ui", content=script_content,
            file_name=f"test_{case.case_code.lower().replace('-', '_')}_ui.py",
            language="python", source="ai_generated",
        )
    else:
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
                language="python", content=script_content,
                file_name=f"test_{case.case_code.lower().replace('-', '_')}_ui.py",
                status="draft", source="ai_generated",
            )
            session.add(script)
            await session.flush()
        else:
            script = await script_service.create_script(
                session, case_id=case.id, script_type="ui", content=script_content,
                file_name=f"test_{case.case_code.lower().replace('-', '_')}_ui.py",
                language="python", source="ai_generated",
            )

    case.ui_scenario_status = "completed" if gen_result.get("all_passed") else "debugging"
    case.ui_scenario = {
        **(case.ui_scenario or {}),
        "steps": [
            {"seq": i + 1, "action": s.get("action", ""), "expected": s.get("expected", "")}
            for i, s in enumerate(case.steps or [])
        ],
        "scriptId": str(script.id),
        "stepCache": gen_result.get("step_cache", {}),
        "lastResults": [
            {"step": r.get("step", ""), "action": r.get("step", ""), "status": r["status"],
             "error": r.get("error", ""), "code": r.get("code", "")[:200] if r.get("code") else ""}
            for r in gen_result.get("results", [])
        ],
        "capturedRequests": gen_result.get("captured_requests", [])[:50],
    }

    # 保存修复档案
    for hr in gen_result.get("healing_records", []):
        try:
            from app.models.healing_archive import HealingArchive
            session.add(HealingArchive(
                case_id=case.id, step_seq=hr.get("step_seq"),
                step_action=hr.get("step_action", ""), page_url=hr.get("page_url", ""),
                failure_type=hr.get("failure_type", "script_bug"),
                original_code=hr.get("original_code", ""), error_summary=hr.get("error_summary", ""),
                fix_code=hr.get("fix_code"), fix_method=hr.get("fix_method", ""),
                page_snapshot=hr.get("page_snapshot", ""), resolved=hr.get("resolved", False),
            ))
        except Exception:
            pass

    await session.flush()

    return {
        "script_id": str(script.id),
        "content": script_content,
        "case_id": case_id,
        "version": script.version,
    }


async def repair_ui_script(
    case_id: str,
    session: AsyncSession,
    error_summary: str,
    stdout: str = "",
) -> dict:
    """分析执行失败原因，读取调试历史，修复脚本。"""
    from sqlalchemy import select as sa_select
    from app.models.script import ScriptRun

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


def _format_case(case: Case, fixture_name: str) -> str:
    lines = [
        f"## 用例: {case.title}",
        f"- 编号: {case.case_code}",
        f"- 优先级: {case.priority}",
        f"- 登录方式: 使用 `{fixture_name}` fixture（conftest 已注入，不需要自己写登录代码）",
    ]
    if case.preconditions:
        lines.append(f"- 前置条件: {case.preconditions}")
    if case.steps:
        lines.append("- 步骤:")
        for i, step in enumerate(case.steps, 1):
            action = step.get("action", "")
            expected = step.get("expected", "")
            lines.append(f"  {i}. {action}")
            if expected:
                lines.append(f"     预期: {expected}")
    if case.expected_result:
        lines.append(f"- 总体预期: {case.expected_result}")
    return "\n".join(lines)


def _format_env_vars(env_vars: dict[str, str]) -> str:
    lines = []
    for key, value in sorted(env_vars.items()):
        if any(s in key.lower() for s in ("password", "secret", "token")):
            lines.append(f"- {key} = (已配置)")
        else:
            lines.append(f"- {key} = \"{value}\"")
    return "\n".join(lines)


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
