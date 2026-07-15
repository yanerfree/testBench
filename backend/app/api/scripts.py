import uuid
import io
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

import anyio
from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.deps.auth import require_project_role
from app.deps.db import get_db
from app.models.case import Case
from app.models.environment import EnvironmentVariable
from app.models.script import Script, ScriptRun
from app.models.user import User
from app.schemas.script import CreateScriptRequest, ScriptResponse
from app.services import script_service

router = APIRouter(
    prefix="/api/projects/{project_id}/branches/{branch_id}/cases/{case_id}/scripts",
    tags=["scripts"],
)


@router.get("")
async def list_script_versions(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="api"),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    versions = await script_service.list_versions(session, case_id, script_type)
    return {
        "data": [
            ScriptResponse.model_validate(s, from_attributes=True).model_dump(by_alias=True)
            for s in versions
        ]
    }


@router.get("/active")
async def get_active_script(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="api"),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    script = await script_service.get_active_script(session, case_id, script_type)
    if not script:
        return {"data": None}
    return {
        "data": ScriptResponse.model_validate(script, from_attributes=True).model_dump(by_alias=True)
    }


@router.post("")
async def create_script(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    body: CreateScriptRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    script = await script_service.create_script(
        session,
        case_id=case_id,
        script_type=body.script_type,
        content=body.content,
        file_name=body.file_name,
        func_name=body.func_name,
        language=body.language,
        source=body.source,
        created_by=user.id,
    )
    return {
        "data": ScriptResponse.model_validate(script, from_attributes=True).model_dump(by_alias=True)
    }


@router.post("/generate")
async def generate_script_ai(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="ui"),
    env_id: uuid.UUID | None = Body(default=None, alias="envId", embed=True),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """AI 生成 Playwright 测试脚本"""
    if script_type != "ui":
        raise AppError(code="INVALID_TYPE", message="AI 生成仅支持 UI 脚本类型")

    from app.services.ai.ui_script_gen_service import generate_ui_script
    result = await generate_ui_script(
        case_id=str(case_id),
        session=session,
        env_id=str(env_id) if env_id else None,
    )
    await session.commit()
    return {"data": result}


@router.post("/generate-stream")
async def generate_script_ai_stream(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="ui"),
    env_id: uuid.UUID | None = Body(default=None, alias="envId", embed=True),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """SSE 流式 AI 生成 — 实时推送每步生成进度"""
    import asyncio
    import json as json_mod

    if script_type != "ui":
        raise AppError(code="INVALID_TYPE", message="仅支持 UI 脚本")

    from app.models.environment import EnvironmentVariable
    from app.services.ai.ui_script_gen_service import _detect_fixture, _get_credentials
    from app.services.ai.step_generator import step_by_step_generate

    case = await session.get(Case, case_id)
    if not case:
        raise NotFoundError(code="CASE_NOT_FOUND", message="用例不存在")

    env_vars = {}
    if env_id:
        rows = await session.execute(
            select(EnvironmentVariable).where(EnvironmentVariable.environment_id == env_id)
        )
        env_vars = {v.key: v.value for v in rows.scalars().all()}

    base_url = env_vars.get("BASE_URL", "")
    fixture_name = _detect_fixture(case.preconditions or "")
    creds = _get_credentials(env_vars, fixture_name)
    # 备用角色凭据（多角色场景用）
    alt_fixture = "tenant_page" if fixture_name == "logged_in_page" else "logged_in_page"
    alt_creds = _get_credentials(env_vars, alt_fixture)

    queue = asyncio.Queue()

    def on_step(event):
        queue.put_nowait(event)

    # 查历史修复记录
    healing_history = []
    try:
        from app.models.healing_archive import HealingArchive
        ha_result = await session.execute(
            select(HealingArchive).where(HealingArchive.case_id == case_id)
            .order_by(HealingArchive.created_at.desc()).limit(20)
        )
        healing_history = [
            {"step_seq": h.step_seq, "page_url": h.page_url, "original_code": h.original_code, "resolved": h.resolved}
            for h in ha_result.scalars().all()
        ]
    except Exception:
        pass

    async def run_generate():
        import anyio
        from app.services.ai.step_generator import step_by_step_generate
        result = await anyio.to_thread.run_sync(lambda: step_by_step_generate(
            base_url=base_url, credentials=creds, steps=case.steps or [],
            fixture_name=fixture_name, on_step=on_step,
            preconditions=case.preconditions or "",
            headless=False,
            alt_credentials=alt_creds,
        ))
        queue.put_nowait({"type": "done", "result": result})

    task = asyncio.create_task(run_generate())

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=300)
                except asyncio.TimeoutError:
                    break
                if event["type"] == "done":
                    gen_result = event["result"]
                    script_content = gen_result.get("script", "")
                    if script_content.strip():
                        all_passed = gen_result.get("all_passed", False)
                        # 转正状态机：通过 → active，失败 → draft（不覆盖已有的好脚本）
                        if all_passed:
                            script = await script_service.create_script(
                                session, case_id=case.id, script_type="ui", content=script_content,
                                file_name=f"test_{case.case_code.lower().replace('-', '_')}_ui.py",
                                language="python", source="ai_generated",
                            )
                        else:
                            # 失败脚本存为 draft，不影响现有 active 版本
                            existing = await script_service.get_active_script(session, case.id, "ui")
                            if existing:
                                # 有 active 版本 → 新建 draft，不覆盖
                                from sqlalchemy import func as sa_func
                                max_ver_result = await session.execute(
                                    select(sa_func.max(Script.version)).where(
                                        Script.case_id == case.id, Script.script_type == "ui"
                                    )
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
                                # 没有 active 版本 → 直接存（第一次生成，哪怕失败也保留）
                                script = await script_service.create_script(
                                    session, case_id=case.id, script_type="ui", content=script_content,
                                    file_name=f"test_{case.case_code.lower().replace('-', '_')}_ui.py",
                                    language="python", source="ai_generated",
                                )

                        case.ui_scenario_status = "completed" if all_passed else "debugging"
                        if not case.ui_scenario:
                            case.ui_scenario = {}
                        case.ui_scenario = {
                            **case.ui_scenario,
                            "steps": [{"seq": j+1, "action": s.get("action",""), "expected": s.get("expected","")} for j, s in enumerate(case.steps or [])],
                            "scriptId": str(script.id),
                            "stepCache": gen_result.get("step_cache", {}),
                            "lastResults": [{"step": r.get("step",""), "action": r.get("step",""), "status": r["status"], "error": r.get("error",""), "code": r.get("code","")[:200] if r.get("code") else ""} for r in gen_result["results"]],
                            "capturedRequests": gen_result.get("captured_requests", [])[:50],
                        }
                        await session.commit()

                    # 保存修复档案
                    for hr in gen_result.get("healing_records", []):
                        from app.models.healing_archive import HealingArchive
                        session.add(HealingArchive(
                            case_id=case.id, step_seq=hr["step_seq"], step_action=hr["step_action"],
                            page_url=hr.get("page_url"), original_code=hr["original_code"],
                            error_summary=hr["error_summary"], fix_code=hr.get("fix_code"),
                            fix_method=hr.get("fix_method"), page_snapshot=hr.get("page_snapshot"),
                            resolved=hr.get("resolved", False),
                        ))
                    if gen_result.get("healing_records"):
                        await session.commit()

                    yield f"event: done\ndata: {json_mod.dumps({'status': 'passed' if gen_result['all_passed'] else 'failed', 'all_passed': gen_result['all_passed'], 'results': [{'step': r.get('step',''), 'action': r.get('step',''), 'status': r['status'], 'error': r.get('error','')} for r in gen_result['results']], 'captured_requests': gen_result.get('captured_requests', [])[:50]}, ensure_ascii=False)}\n\n"
                    break
                else:
                    yield f"event: {event['type']}\ndata: {json_mod.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json_mod.dumps({'error': str(e)[:300]}, ensure_ascii=False)}\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/repair")
async def repair_script_ai(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    error_summary: str = Body(default="", alias="errorSummary"),
    stdout: str = Body(default=""),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """AI 分析执行失败原因并修复脚本"""
    from app.services.ai.ui_script_gen_service import repair_ui_script
    result = await repair_ui_script(
        case_id=str(case_id),
        session=session,
        error_summary=error_summary,
        stdout=stdout,
    )
    await session.commit()
    return {"data": result}


@router.post("/run")
async def run_script(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="api"),
    env_id: uuid.UUID | None = Body(default=None, alias="envId", embed=True),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """直接运行 DB 中的脚本，返回执行结果并持久化到 script_runs 表。"""
    script = await script_service.get_active_script(session, case_id, script_type)
    if not script:
        raise NotFoundError(code="SCRIPT_NOT_FOUND", message="没有可执行的脚本")

    env_vars: dict[str, str] = {}
    if env_id:
        rows = await session.execute(
            select(EnvironmentVariable)
            .where(EnvironmentVariable.environment_id == env_id)
        )
        for v in rows.scalars().all():
            env_vars[v.key] = v.value

    file_name = script.file_name or f"test_{script_type}.py"
    content = script.content

    # 把环境变量注入脚本中 os.getenv 的默认值
    for var_name, var_value in env_vars.items():
        content = re.sub(
            rf'({re.escape(var_name)}\s*=\s*os\.getenv\(\s*"{re.escape(var_name)}"\s*,\s*)(["\']).*?\2',
            lambda m, v=var_value: f'{m.group(1)}{m.group(2)}{v}{m.group(2)}',
            content,
            count=1,
        )

    sandbox_dir = tempfile.mkdtemp(prefix="tb_run_")
    try:
        script_path = Path(sandbox_dir) / file_name
        script_path.parent.mkdir(parents=True, exist_ok=True)
        script_path.write_text(content, encoding="utf-8")

        from app.engine.executor import execute_single_case
        result = await anyio.to_thread.run_sync(
            lambda: execute_single_case(
                sandbox_dir=sandbox_dir,
                script_ref_file=file_name,
                script_ref_func=script.func_name,
                env_vars=env_vars,
                timeout=120,
            )
        )
    finally:
        shutil.rmtree(sandbox_dir, ignore_errors=True)

    run_record = ScriptRun(
        case_id=case_id,
        script_id=script.id,
        script_type=script_type,
        status=result.get("status", "error"),
        duration_ms=result.get("duration_ms"),
        error_summary=result.get("error_summary"),
        stdout=result.get("stdout"),
        screenshots=result.get("screenshots") or None,
        executed_by=user.id,
    )
    session.add(run_record)

    # 更新用例 UI 场景状态
    if script_type == "ui":
        case = await session.get(Case, case_id)
        if case:
            case.ui_scenario_status = "completed" if result.get("status") == "passed" else "debugging"

    await session.commit()
    await session.refresh(run_record)

    result["id"] = str(run_record.id)
    result["created_at"] = run_record.created_at.isoformat()
    return {"data": result}


@router.post("/run-stream")
async def run_script_stream(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="ui"),
    env_id: uuid.UUID | None = Body(default=None, alias="envId", embed=True),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    """SSE 流式执行脚本 — 实时推送步骤进度"""
    import asyncio
    import json
    import subprocess
    import time as time_mod

    script = await script_service.get_active_script(session, case_id, script_type)
    if not script:
        raise NotFoundError(code="SCRIPT_NOT_FOUND", message="没有可执行的脚本")

    env_vars: dict[str, str] = {}
    if env_id:
        rows = await session.execute(
            select(EnvironmentVariable).where(EnvironmentVariable.environment_id == env_id)
        )
        for v in rows.scalars().all():
            env_vars[v.key] = v.value

    file_name = script.file_name or f"test_{script_type}.py"
    content = script.content
    for var_name, var_value in env_vars.items():
        content = re.sub(
            rf'({re.escape(var_name)}\s*=\s*os\.getenv\(\s*"{re.escape(var_name)}"\s*,\s*)(["\']).*?\2',
            lambda m, v=var_value: f'{m.group(1)}{m.group(2)}{v}{m.group(2)}',
            content, count=1,
        )

    sandbox_dir = tempfile.mkdtemp(prefix="tb_run_")
    script_path = Path(sandbox_dir) / file_name
    script_path.parent.mkdir(parents=True, exist_ok=True)
    script_path.write_text(content, encoding="utf-8")

    from app.engine.command_builder import build_pytest_command, is_playwright_script
    import os as os_mod

    pw_output_dir = None
    if is_playwright_script(content):
        pw_output_dir = str(Path(sandbox_dir) / ".pw_results")
        Path(pw_output_dir).mkdir(parents=True, exist_ok=True)
        from app.engine.pw_conftest import write_playwright_conftest
        write_playwright_conftest(sandbox_dir, env_vars)

    plugin_src = Path(__file__).resolve().parent.parent / "engine" / "plugins" / "tea_capture.py"
    step_src = Path(__file__).resolve().parent.parent / "engine" / "plugins" / "tea_step.py"
    tea_plugins_dir = Path(sandbox_dir) / ".tea_plugins"
    tea_results_dir = Path(sandbox_dir) / ".tea_results"
    tea_plugins_dir.mkdir(parents=True, exist_ok=True)
    tea_results_dir.mkdir(parents=True, exist_ok=True)
    if plugin_src.exists():
        shutil.copy2(str(plugin_src), str(tea_plugins_dir / "tea_capture.py"))
    if step_src.exists():
        shutil.copy2(str(step_src), str(tea_plugins_dir / "tea_step.py"))

    import sys
    junit_path = tempfile.mktemp(suffix=".xml")
    cmd = build_pytest_command(sandbox_dir, file_name, script.func_name, junit_path, plugin_src.exists(), pw_output_dir)

    run_env = os_mod.environ.copy()
    run_env.update(env_vars)
    run_env["PYTHONPATH"] = str(tea_plugins_dir) + ":" + run_env.get("PYTHONPATH", "")
    run_env["TEA_CAPTURE_DIR"] = str(tea_results_dir)

    async def event_generator():
        start_time = time_mod.time()
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            cwd=sandbox_dir, env=run_env,
        )
        stderr_chunks = []

        async def drain_stderr():
            async for line in proc.stderr:
                stderr_chunks.append(line.decode("utf-8", errors="ignore"))

        stderr_task = asyncio.create_task(drain_stderr())

        try:
            async for line in proc.stdout:
                text = line.decode("utf-8", errors="ignore").rstrip()
                if text.startswith("##STEP_START##"):
                    data = text[len("##STEP_START##"):]
                    yield f"event: step_start\ndata: {data}\n\n"
                elif text.startswith("##STEP_END##"):
                    data = text[len("##STEP_END##"):]
                    yield f"event: step_end\ndata: {data}\n\n"

            try:
                await asyncio.wait_for(proc.wait(), timeout=10)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()

            await stderr_task
            stderr = "".join(stderr_chunks)
            duration_ms = int((time_mod.time() - start_time) * 1000)

            from app.engine.result_parser import parse_junit_xml, parse_step_json
            junit_results = parse_junit_xml(junit_path)

            status = "passed"
            error_summary = None
            if not junit_results:
                status = "error" if proc.returncode != 0 else "passed"
                error_summary = stderr[:2000] if proc.returncode != 0 else None
            else:
                statuses = [r["status"] for r in junit_results]
                if "error" in statuses: status = "error"
                elif "failed" in statuses: status = "failed"
                error_msgs = [r["message"] for r in junit_results if r["message"]]
                error_summary = "; ".join(error_msgs)[:2000] if error_msgs else None

            steps = []
            for jf in sorted(tea_results_dir.glob("*.json")):
                steps = parse_step_json(str(jf))
                if steps: break

            from app.engine.executor import _collect_screenshots
            screenshots = _collect_screenshots(pw_output_dir) if pw_output_dir else []

            final = json.dumps({
                "status": status, "duration_ms": duration_ms, "error_summary": error_summary,
                "steps": steps, "screenshots": screenshots,
            }, ensure_ascii=False, default=str)
            yield f"event: done\ndata: {final}\n\n"

        finally:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            try: os_mod.unlink(junit_path)
            except: pass
            shutil.rmtree(sandbox_dir, ignore_errors=True)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/runs")
async def list_script_runs(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_type: str = Query(alias="type", default="api"),
    limit: int = Query(default=20, le=100),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """获取用例的脚本执行历史列表。"""
    result = await session.execute(
        select(ScriptRun)
        .where(ScriptRun.case_id == case_id, ScriptRun.script_type == script_type)
        .order_by(ScriptRun.created_at.desc())
        .limit(limit)
    )
    runs = result.scalars().all()
    return {
        "data": [
            {
                "id": str(r.id),
                "case_id": str(r.case_id),
                "script_type": r.script_type,
                "status": r.status,
                "duration_ms": r.duration_ms,
                "error_summary": r.error_summary,
                "stdout": r.stdout,
                "screenshots": r.screenshots,
                "executed_by": str(r.executed_by),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ]
    }


@router.post("/{script_id}/activate")
async def activate_script_version(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    case_id: uuid.UUID,
    script_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    script = await script_service.activate_version(session, script_id)
    if not script:
        raise NotFoundError(code="SCRIPT_NOT_FOUND", message="脚本版本不存在")
    return {
        "data": ScriptResponse.model_validate(script, from_attributes=True).model_dump(by_alias=True)
    }


# --- 导出路由（分支级别） ---
export_router = APIRouter(
    prefix="/api/projects/{project_id}/branches/{branch_id}/scripts",
    tags=["scripts"],
)


@export_router.get("/export")
async def export_scripts(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    script_type: str | None = Query(default=None, alias="type"),
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_project_role("project_admin", "developer", "tester", "guest")),
):
    """导出分支下所有 active 脚本为 zip 压缩包（可直接 pytest 运行）。"""
    query = (
        select(Script, Case.case_code)
        .join(Case, Script.case_id == Case.id)
        .where(Case.branch_id == branch_id, Script.status == "active")
    )
    if script_type:
        query = query.where(Script.script_type == script_type)

    result = await session.execute(query)
    rows = result.all()

    if not rows:
        raise NotFoundError(code="NO_SCRIPTS", message="没有可导出的脚本")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for script_obj, case_code in rows:
            folder = f"tests/{script_obj.script_type}"
            fname = script_obj.file_name or f"{case_code.lower().replace('-', '_')}.py"
            zf.writestr(f"{folder}/{fname}", script_obj.content)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=scripts-export.zip"},
    )
