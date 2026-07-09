"""接口测试场景生成 — 读取 API 定义 → AI 生成场景+步骤 → 存储"""
from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import AsyncIterator

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_test import ApiTestScenario, ApiTestStep
from app.models.api_test_folder import ApiTestFolder
from app.services.ai import llm_client
from app.services.ai_config_resolver import ResolvedAIConfig

logger = logging.getLogger(__name__)


@dataclass
class GenEvent:
    type: str
    data: dict


async def generate_api_test(
    *,
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    api_info: str,
    api_ids: list[str] | None,
    env_variables: dict | None,
    folder_id: uuid.UUID | None = None,
    ai_config: ResolvedAIConfig,
    session: AsyncSession,
    user_id: uuid.UUID,
) -> AsyncIterator[GenEvent]:
    """生成接口测试场景。"""

    yield GenEvent(type="step_start", data={"step": 1, "title": "读取接口定义和环境变量"})

    # 如果前端没传环境变量，从项目第一个环境自动读取
    if not env_variables:
        try:
            from app.mcp.tools import environments
            envs = await environments.list_environments(session=session)
            if envs and len(envs) > 0:
                first_env = envs[0]
                merged = await environments.get_merged_variables(session=session, env_id=str(first_env["id"]))
                if merged:
                    env_variables = {v["key"]: v["value"] for v in merged if v.get("key")}
        except Exception as e:
            logger.warning("Auto-load env vars failed: %s", e)

    # 从 API 节点读取详情（如果有 api_ids）
    full_api_info = api_info or ""
    if api_ids:
        from app.mcp.tools import api_endpoints
        for aid in api_ids:
            try:
                node = await api_endpoints.get_api_node(session, aid)
                if node:
                    parts = [f"### {node.get('method', 'GET')} {node.get('url', '')} — {node.get('name', '')}"]
                    if node.get("description"):
                        parts.append(f"描述: {node['description']}")
                    if node.get("params"):
                        parts.append(f"参数 Schema: {json.dumps(node['params'], ensure_ascii=False)}")
                    if node.get("headers"):
                        parts.append(f"Headers: {json.dumps(node['headers'], ensure_ascii=False)}")
                    if node.get("body"):
                        parts.append(f"Body: {node['body'][:500]}")
                    full_api_info += "\n\n" + "\n".join(parts)
            except Exception as e:
                logger.warning("Failed to load api node %s: %s", aid, e)

    if not full_api_info.strip():
        yield GenEvent(type="error", data={"message": "没有接口信息，请选择接口或手动输入"})
        return

    yield GenEvent(type="step_done", data={"step": 1, "summary": f"接口信息 {len(full_api_info)} 字符"})

    # Step 2: AI 生成
    yield GenEvent(type="step_start", data={"step": 2, "title": "AI 生成测试场景"})

    from pathlib import Path
    skill_path = Path(__file__).resolve().parent.parent.parent / "skills" / "preset" / "tb-api-case-generate" / "SKILL.md"
    skill_content = ""
    if skill_path.exists():
        raw = skill_path.read_text(encoding="utf-8")
        # 去掉 frontmatter
        if raw.startswith("---"):
            end = raw.find("---", 3)
            if end > 0:
                raw = raw[end + 3:].strip()
        skill_content = raw

    env_str = ""
    if env_variables:
        env_str = "\n".join(f"- ${{{k}}} = {v}" for k, v in env_variables.items())

    messages = [
        {"role": "system", "content": f"""你是资深 QA 工程师。严格按照以下规范生成接口测试场景。

{skill_content}

{f'当前项目环境变量：\n{env_str}' if env_str else ''}

直接输出 JSON，不要用 ```json 包裹。"""},
        {"role": "user", "content": f"""请根据以下接口定义生成测试场景：

{full_api_info}"""},
    ]

    full_content = ""
    try:
        async for chunk in llm_client.stream(messages, config=ai_config, max_tokens=8192):
            if chunk.delta:
                full_content += chunk.delta
                yield GenEvent(type="step_progress", data={"step": 2, "chunk": chunk.delta})
    except Exception as e:
        yield GenEvent(type="error", data={"message": f"AI 生成失败: {str(e)[:200]}"})
        return

    yield GenEvent(type="step_done", data={"step": 2, "summary": f"生成完成 {len(full_content)} 字符"})

    # Step 3: 解析 + 入库
    yield GenEvent(type="step_start", data={"step": 3, "title": "解析结果并入库"})

    parsed = _parse_scenarios(full_content)
    if not parsed:
        yield GenEvent(type="error", data={"message": "无法解析 AI 返回的 JSON"})
        return

    # 获取当前最大编号
    max_code_result = await session.execute(
        select(sa_func.count()).where(
            ApiTestScenario.project_id == project_id,
            ApiTestScenario.branch_id == branch_id,
        )
    )
    code_seq = (max_code_result.scalar() or 0) + 1

    created_ids = []
    auto_folders: dict[str, uuid.UUID] = {}

    for sc in parsed:
        sc_folder_id = folder_id
        if not sc_folder_id:
            module_name = _guess_module_name(sc.get("title", ""), full_api_info)
            if module_name:
                if module_name in auto_folders:
                    sc_folder_id = auto_folders[module_name]
                else:
                    existing = await session.execute(
                        select(ApiTestFolder).where(
                            ApiTestFolder.branch_id == branch_id,
                            ApiTestFolder.name == module_name,
                        )
                    )
                    folder = existing.scalars().first()
                    if not folder:
                        folder = ApiTestFolder(branch_id=branch_id, name=module_name)
                        session.add(folder)
                        await session.flush()
                    sc_folder_id = folder.id
                    auto_folders[module_name] = folder.id

        scenario = ApiTestScenario(
            project_id=project_id,
            branch_id=branch_id,
            code=f"AT-{code_seq:04d}",
            title=sc.get("title", "未命名场景"),
            priority=sc.get("priority", "P1"),
            description=sc.get("description", ""),
            status="draft",
            source_api_ids=api_ids,
            env_variables=env_variables,
            folder_id=sc_folder_id,
            created_by=user_id,
        )
        session.add(scenario)
        await session.flush()

        for i, step in enumerate(sc.get("steps", [])):
            assertions = _normalize_assertions(step.get("assertions", []))
            session.add(ApiTestStep(
                scenario_id=scenario.id,
                sort_order=i,
                group_name=step.get("group"),
                name=step.get("name", f"步骤{i+1}"),
                method=step.get("method", "GET"),
                url=step.get("url", ""),
                headers=step.get("headers"),
                body=step.get("body"),
                assertions=assertions,
                variables_extract=step.get("variables_extract"),
            ))

        created_ids.append(str(scenario.id))
        code_seq += 1

        await session.commit()

        yield GenEvent(type="scenario_created", data={
            "id": str(scenario.id),
            "code": scenario.code,
            "title": scenario.title,
            "priority": scenario.priority,
            "stepCount": len(sc.get("steps", [])),
        })

    yield GenEvent(type="step_done", data={
        "step": 3,
        "summary": f"创建 {len(created_ids)} 个场景",
    })

    yield GenEvent(type="done", data={
        "scenarioIds": created_ids,
        "totalScenarios": len(created_ids),
    })


def _parse_scenarios(content: str) -> list[dict]:
    """解析 AI 返回的 JSON，提取 scenarios 数组。"""
    # 尝试从 ```json 块提取
    json_match = re.search(r"```json\s*\n(.*?)\n```", content, re.DOTALL)
    text = json_match.group(1) if json_match else content

    # 尝试找 { 开头的 JSON
    brace = text.find("{")
    if brace < 0:
        logger.warning("No '{' found in AI output, len=%d", len(content))
        return []
    text = text[brace:]

    try:
        data = json.loads(text)
        return data.get("scenarios", [data] if "title" in data else [])
    except json.JSONDecodeError as e:
        logger.warning("JSON parse failed: %s, trying truncation fix", e)
        # 截断修复：逐步缩短找到可解析的 JSON
        for end_pos in range(len(text), max(len(text) - 500, 0), -1):
            if text[end_pos - 1] not in '}]':
                continue
            for suffix in ['', ']', ']}', ']}]', ']}]}']:
                try:
                    data = json.loads(text[:end_pos] + suffix)
                    scenarios = data.get("scenarios", [data] if "title" in data else [])
                    if scenarios:
                        logger.info("Truncation fix succeeded with suffix='%s'", suffix)
                        return scenarios
                except json.JSONDecodeError:
                    continue

    logger.warning("All parse attempts failed, content[:200]=%s", content[:200])
    return []


def _normalize_assertions(assertions: list[dict]) -> list[dict]:
    """标准化 AI 生成的断言格式。
    AI 有时把字段路径放在 value 而不是 field 里，这里统一修正。
    """
    result = []
    for a in assertions:
        a = dict(a)
        if a.get("type") == "body_field":
            if "field" not in a and "value" in a:
                if a.get("expected") is not None:
                    a["field"] = a.pop("value")
                elif a.get("operator") == "not_empty":
                    a["field"] = a.pop("value")
        result.append(a)
    return result


# URL 路径 → 模块名映射
_URL_MODULE_MAP = {
    "user": "用户管理",
    "auth": "认证",
    "project": "项目管理",
    "plan": "测试计划",
    "report": "测试报告",
    "case": "用例管理",
    "env": "环境管理",
    "config": "配置管理",
}


def _guess_module_name(title: str, api_info: str) -> str | None:
    """根据场景标题和接口信息推断模块名。"""
    urls = re.findall(r'/api/(\w+)', api_info)
    if urls:
        segment = urls[0].lower().rstrip('s')
        for key, name in _URL_MODULE_MAP.items():
            if key in segment:
                return name
        return urls[0].replace('_', ' ').title()

    for key, name in _URL_MODULE_MAP.items():
        if key in title.lower():
            return name

    parts = title.split('-')
    if len(parts) >= 2:
        return parts[0]

    return None
