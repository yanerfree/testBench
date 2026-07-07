"""接口测试执行引擎 — 单步/场景/批量执行 + TokenCache + 变量传递"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_test import ApiTestScenario, ApiTestStep

logger = logging.getLogger(__name__)

_run_semaphore = asyncio.Semaphore(5)


@dataclass
class StepResult:
    step_id: str
    step_name: str
    method: str
    url: str
    status: str  # pass | fail | skip
    status_code: int | None = None
    duration: int = 0
    assertions: list[dict] = field(default_factory=list)
    response_body: dict | None = None
    error: str | None = None


@dataclass
class ScenarioResult:
    scenario_id: str
    scenario_title: str
    steps: list[StepResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(s.status == "pass" or s.status == "skip" for s in self.steps)

    @property
    def pass_count(self) -> int:
        return sum(1 for s in self.steps if s.status == "pass")

    @property
    def fail_count(self) -> int:
        return sum(1 for s in self.steps if s.status == "fail")


@dataclass
class RunEvent:
    type: str  # scenario_start | step_result | scenario_done | run_done | error
    data: dict


def _resolve_variables(text, env: dict) -> str:
    if not isinstance(text, str):
        return text
    return re.sub(r'\$\{(\w+)\}', lambda m: str(env.get(m.group(1), m.group(0))), text)


def _resolve_obj(obj, env: dict):
    if isinstance(obj, str):
        return _resolve_variables(obj, env)
    if isinstance(obj, dict):
        return {k: _resolve_obj(v, env) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_obj(v, env) for v in obj]
    return obj


def _extract_value(body, path: str):
    val = body
    for key in path.split("."):
        if isinstance(val, dict):
            val = val.get(key)
        else:
            return None
    return val


def _check_assertions(assertions: list[dict], status_code: int, resp_body) -> list[dict]:
    results = []
    for a in assertions:
        passed = False
        a_type = a.get("type")
        operator = a.get("operator", "==")
        expected = a.get("expected", a.get("value"))
        field_path = a.get("field") or (a.get("value") if a.get("expected") is not None or operator == "not_empty" else None)

        if a_type == "status":
            expected = a.get("value")
            actual = status_code
            if operator == "==":
                passed = actual == expected
            elif operator == "!=":
                passed = actual != expected
            elif operator == "in":
                passed = actual in (expected if isinstance(expected, list) else [expected])
        elif a_type == "body_contains":
            contain_val = a.get("value", a.get("expected", ""))
            passed = str(contain_val) in str(resp_body)
        elif a_type == "body_field":
            actual = _extract_value(resp_body, field_path) if field_path else resp_body
            if operator == "==":
                passed = actual == expected
            elif operator == "!=":
                passed = actual != expected
            elif operator == "not_empty":
                passed = actual is not None and actual != ""

        results.append({**a, "passed": passed})
    return results


async def run_single_step(
    step: ApiTestStep,
    env: dict,
    client: httpx.AsyncClient,
) -> StepResult:
    if not step.enabled:
        return StepResult(
            step_id=str(step.id), step_name=step.name,
            method=step.method, url=step.url, status="skip",
        )

    url = _resolve_variables(step.url, env)
    headers = _resolve_obj(step.headers or {}, env)
    body = _resolve_obj(step.body, env)

    if "Authorization" not in headers and "AUTH_TOKEN" in env:
        headers["Authorization"] = f"Bearer {env['AUTH_TOKEN']}"
    if "Content-Type" not in headers and body:
        headers["Content-Type"] = "application/json"

    start = time.time()
    try:
        resp = await client.request(method=step.method, url=url, headers=headers, json=body if body else None)
        duration = int((time.time() - start) * 1000)

        try:
            resp_body = resp.json()
        except Exception:
            resp_body = {"_text": resp.text[:2000]}

        assertion_results = _check_assertions(step.assertions or [], resp.status_code, resp_body)
        all_pass = all(a["passed"] for a in assertion_results) if assertion_results else True

        if step.variables_extract and resp_body:
            for var_name, path in step.variables_extract.items():
                val = _extract_value(resp_body, path)
                if val is not None:
                    env[var_name] = str(val)

        return StepResult(
            step_id=str(step.id), step_name=step.name,
            method=step.method, url=url,
            status="pass" if all_pass else "fail",
            status_code=resp.status_code, duration=duration,
            assertions=assertion_results,
            response_body=resp_body if isinstance(resp_body, (dict, list)) else {"_text": str(resp_body)},
        )
    except Exception as e:
        duration = int((time.time() - start) * 1000)
        return StepResult(
            step_id=str(step.id), step_name=step.name,
            method=step.method, url=url,
            status="fail", duration=duration, error=str(e)[:500],
        )


async def run_scenario(
    scenario: ApiTestScenario,
    steps: list[ApiTestStep],
    session: AsyncSession,
) -> AsyncIterator[RunEvent]:
    async with _run_semaphore:
        env = dict(scenario.env_variables or {})

        yield RunEvent(type="scenario_start", data={
            "scenarioId": str(scenario.id),
            "title": scenario.title,
            "stepCount": len(steps),
        })

        results = []
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            for step in steps:
                result = await run_single_step(step, env, client)
                results.append(result)

                step.last_status = result.status
                step.last_response = {
                    "statusCode": result.status_code,
                    "duration": result.duration,
                    "body": result.response_body,
                    "assertions": result.assertions,
                } if not result.error else {"error": result.error}

                yield RunEvent(type="step_result", data={
                    "scenarioId": str(scenario.id),
                    "stepId": result.step_id,
                    "stepName": result.step_name,
                    "status": result.status,
                    "statusCode": result.status_code,
                    "duration": result.duration,
                })

        await session.commit()

        scenario_result = ScenarioResult(
            scenario_id=str(scenario.id),
            scenario_title=scenario.title,
            steps=results,
        )
        yield RunEvent(type="scenario_done", data={
            "scenarioId": str(scenario.id),
            "title": scenario.title,
            "passed": scenario_result.passed,
            "passCount": scenario_result.pass_count,
            "failCount": scenario_result.fail_count,
        })


async def run_batch(
    scenario_ids: list[uuid.UUID],
    session: AsyncSession,
    user_id: uuid.UUID | None = None,
    report_name: str | None = None,
) -> AsyncIterator[RunEvent]:
    all_results: list[ScenarioResult] = []

    for sid in scenario_ids:
        scenario = await session.get(ApiTestScenario, sid)
        if not scenario:
            continue

        steps_result = await session.execute(
            select(ApiTestStep)
            .where(ApiTestStep.scenario_id == sid)
            .order_by(ApiTestStep.sort_order)
        )
        steps = steps_result.scalars().all()

        scenario_result = None
        async for event in run_scenario(scenario, steps, session):
            yield event
            if event.type == "scenario_done":
                scenario_result = ScenarioResult(
                    scenario_id=str(scenario.id),
                    scenario_title=scenario.title,
                )
                scenario_result.steps = [
                    StepResult(
                        step_id=str(s.id), step_name=s.name,
                        method=s.method, url=s.url,
                        status=s.last_status or "skip",
                        status_code=s.last_response.get("statusCode") if s.last_response else None,
                        duration=s.last_response.get("duration", 0) if s.last_response else 0,
                        assertions=s.last_response.get("assertions", []) if s.last_response else [],
                        response_body=s.last_response.get("body") if s.last_response else None,
                        error=s.last_response.get("error") if s.last_response else None,
                    ) for s in steps
                ]
        if scenario_result:
            all_results.append(scenario_result)

    if all_results and user_id:
        report_id = await _create_report(session, all_results, user_id, report_name)
        yield RunEvent(type="report_created", data={"reportId": str(report_id)})

    yield RunEvent(type="run_done", data={"totalScenarios": len(scenario_ids)})


async def _create_report(
    session: AsyncSession,
    results: list[ScenarioResult],
    user_id: uuid.UUID,
    report_name: str | None,
) -> uuid.UUID:
    from datetime import datetime, timezone
    from app.models.report import TestReport, TestReportScenario, TestReportStep

    total_pass = sum(r.pass_count for r in results)
    total_fail = sum(r.fail_count for r in results)
    total_steps = sum(len(r.steps) for r in results)
    total_duration = sum(s.duration for r in results for s in r.steps)
    pass_rate = round(total_pass / total_steps * 100, 2) if total_steps > 0 else 0

    now = datetime.now(timezone.utc)
    if not report_name:
        if len(results) == 1:
            report_name = results[0].scenario_title
        else:
            report_name = f"接口测试回归 {now.strftime('%Y-%m-%d %H:%M')}"

    report = TestReport(
        report_type="api_test",
        report_name=report_name,
        executed_by=user_id,
        executed_at=now,
        completed_at=now,
        total_scenarios=len(results),
        passed=sum(1 for r in results if r.passed),
        failed=sum(1 for r in results if not r.passed),
        pass_rate=pass_rate,
        total_duration_ms=total_duration,
    )
    session.add(report)
    await session.flush()

    for i, result in enumerate(results):
        scenario_duration = sum(s.duration for s in result.steps)
        report_scenario = TestReportScenario(
            report_id=report.id,
            scenario_name=result.scenario_title,
            status="passed" if result.passed else "failed",
            execution_type="automated",
            duration_ms=scenario_duration,
            sort_order=i,
        )
        session.add(report_scenario)
        await session.flush()

        for j, step in enumerate(result.steps):
            session.add(TestReportStep(
                scenario_id=report_scenario.id,
                step_name=step.step_name,
                http_method=step.method,
                url=step.url,
                status=step.status,
                status_code=step.status_code,
                duration_ms=step.duration,
                sort_order=j,
                response_data=step.response_body,
                assertions=step.assertions,
                error_summary=step.error,
            ))

    await session.commit()
    logger.info("Created API test report %s: %s", report.id, report_name)
    return report.id
