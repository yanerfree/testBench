"""分支深拷贝服务 — 新建分支时从源分支复制数据（ADR-5）"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def copy_branch_data(
    session: AsyncSession,
    source_branch_id: uuid.UUID,
    target_branch_id: uuid.UUID,
    project_id: uuid.UUID,
    modules: list[str],
    user_id: uuid.UUID,
) -> dict:
    """深拷贝源分支数据到目标分支。

    modules: ["cases", "api_test"] 中的子集
    所有 ID 映射为新 ID，分支间完全独立。
    返回各模块复制的数量统计。
    """
    stats = {}

    if "cases" in modules:
        stats["cases"] = await _copy_cases(session, source_branch_id, target_branch_id, user_id)

    if "api_test" in modules:
        stats["apiTest"] = await _copy_api_tests(session, source_branch_id, target_branch_id, project_id, user_id)

    await session.commit()
    logger.info("Branch copy done: %s -> %s, stats=%s", source_branch_id, target_branch_id, stats)
    return stats


async def _copy_cases(
    session: AsyncSession,
    source_branch_id: uuid.UUID,
    target_branch_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """复制用例文件夹 + 用例"""
    from app.models.case import Case, CaseFolder

    folders_result = await session.execute(
        select(CaseFolder).where(CaseFolder.branch_id == source_branch_id).order_by(CaseFolder.depth)
    )
    folders = folders_result.scalars().all()

    folder_map: dict[uuid.UUID, uuid.UUID] = {}
    for f in folders:
        new_folder = CaseFolder(
            branch_id=target_branch_id,
            name=f.name,
            path=f.path,
            parent_id=folder_map.get(f.parent_id) if f.parent_id else None,
            depth=f.depth,
            sort_order=f.sort_order,
        )
        session.add(new_folder)
        await session.flush()
        folder_map[f.id] = new_folder.id

    cases_result = await session.execute(
        select(Case).where(Case.branch_id == source_branch_id)
    )
    cases = cases_result.scalars().all()

    count = 0
    for c in cases:
        if c.deleted_at:
            continue
        new_case = Case(
            branch_id=target_branch_id,
            folder_id=folder_map.get(c.folder_id) if c.folder_id else None,
            case_code=c.case_code,
            tea_id=c.tea_id,
            title=c.title,
            type=c.type,
            priority=c.priority,
            preconditions=c.preconditions,
            steps=c.steps,
            expected_result=c.expected_result,
            variables_used=c.variables_used,
            api_scenario=c.api_scenario,
            ui_scenario=c.ui_scenario,
            source=c.source,
            automation_status="pending",
            script_ref_file=c.script_ref_file,
            script_ref_func=c.script_ref_func,
            remark=c.remark,
        )
        session.add(new_case)
        count += 1

    await session.flush()
    return {"folders": len(folders), "cases": count}


async def _copy_api_tests(
    session: AsyncSession,
    source_branch_id: uuid.UUID,
    target_branch_id: uuid.UUID,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
) -> dict:
    """复制接口测试文件夹 + 场景 + 步骤。状态重置为 draft，执行历史清空。"""
    from app.models.api_test import ApiTestScenario, ApiTestStep
    from app.models.api_test_folder import ApiTestFolder

    folders_result = await session.execute(
        select(ApiTestFolder).where(ApiTestFolder.branch_id == source_branch_id)
    )
    folders = folders_result.scalars().all()

    # 先复制没有父级的，再复制子级（简单两轮，最多支持两层嵌套按 parent 排序）
    folder_map: dict[uuid.UUID, uuid.UUID] = {}
    pending = list(folders)
    while pending:
        progressed = False
        remaining = []
        for f in pending:
            if f.parent_id is None or f.parent_id in folder_map:
                new_folder = ApiTestFolder(
                    branch_id=target_branch_id,
                    name=f.name,
                    parent_id=folder_map.get(f.parent_id) if f.parent_id else None,
                    sort_order=f.sort_order,
                )
                session.add(new_folder)
                await session.flush()
                folder_map[f.id] = new_folder.id
                progressed = True
            else:
                remaining.append(f)
        if not progressed:
            logger.warning("Folder copy stuck, orphan parents: %s", [str(f.id) for f in remaining])
            break
        pending = remaining

    scenarios_result = await session.execute(
        select(ApiTestScenario).where(ApiTestScenario.branch_id == source_branch_id)
    )
    scenarios = scenarios_result.scalars().all()

    scenario_count = 0
    step_count = 0
    for sc in scenarios:
        new_scenario = ApiTestScenario(
            project_id=project_id,
            branch_id=target_branch_id,
            code=sc.code,
            title=sc.title,
            folder_id=folder_map.get(sc.folder_id) if sc.folder_id else None,
            priority=sc.priority,
            description=sc.description,
            status="draft",
            source=sc.source,
            pre_steps=sc.pre_steps,
            source_api_ids=sc.source_api_ids,
            env_variables=sc.env_variables,
            created_by=user_id,
        )
        session.add(new_scenario)
        await session.flush()
        scenario_count += 1

        steps_result = await session.execute(
            select(ApiTestStep).where(ApiTestStep.scenario_id == sc.id).order_by(ApiTestStep.sort_order)
        )
        for st in steps_result.scalars().all():
            session.add(ApiTestStep(
                scenario_id=new_scenario.id,
                sort_order=st.sort_order,
                group_name=st.group_name,
                name=st.name,
                method=st.method,
                url=st.url,
                headers=st.headers,
                body=st.body,
                assertions=st.assertions,
                variables_extract=st.variables_extract,
                enabled=st.enabled,
                pre_script=st.pre_script,
                post_script=st.post_script,
            ))
            step_count += 1

    await session.flush()
    return {"folders": len(folder_map), "scenarios": scenario_count, "steps": step_count}
