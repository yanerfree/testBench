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
    ai_config: ResolvedAIConfig,
    session: AsyncSession,
    user_id: uuid.UUID,
) -> AsyncIterator[GenEvent]:
    """生成接口测试场景。"""

    yield GenEvent(type="step_start", data={"step": 1, "title": "读取接口定义"})

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
    skill_content = skill_path.read_text(encoding="utf-8") if skill_path.exists() else ""

    # 提取质量红线和输出格式
    quality_rules = ""
    fmt_match = re.search(r"## 质量红线\s*\n(.*?)(?=\n## |\Z)", skill_content, re.DOTALL)
    if fmt_match:
        quality_rules = fmt_match.group(1).strip()

    env_str = ""
    if env_variables:
        env_str = "\n".join(f"- ${{{k}}} = {v}" for k, v in env_variables.items())

    messages = [
        {"role": "system", "content": f"""你是资深 QA 工程师。根据 API 接口定义，生成结构化的接口测试场景。

## 场景拆分规则
- 接口字段 ≤3 个：所有参数校验合成一个场景，场景名 `[接口名]-参数校验`
- 接口字段 >3 个：按字段拆分，每个字段一个场景，场景名 `[接口名]-[字段名]校验`
- 有 CRUD 组合：额外生成 `[模块名]-CRUD完整流程`
- 安全测试：额外生成 `[接口名]-安全测试`

## 每个场景内的步骤生成规则
1. 前置步骤（如需认证）：登录-提取token
2. 按字段约束生成：必填缺失→400、类型错误→400、边界值（min/max/超出）、枚举（有效/无效）、格式（匹配/不匹配）
3. 正向基准：合法参数→期望成功
4. 清理步骤：删除测试创建的资源

## 命名规范
- 场景名：`[接口名]-[测试维度]`
- 步骤名：`[操作]-[具体场景]`，如 `添加用户-用户名长度2(低于最小值)`

## 断言规范
- 每个请求必须有断言，包含具体 HTTP 状态码
- 断言类型：status(状态码)、body_contains(响应包含)、body_field(字段值)
- 请求参数必须是具体值，不能写"无效值"

## 环境变量
公共参数用 ${{VAR}} 引用：${{BASE_URL}}, ${{AUTH_TOKEN}} 等
{f'可用环境变量：{env_str}' if env_str else ''}

## 输出格式
严格输出 JSON：
```json
{{
  "scenarios": [
    {{
      "title": "场景名",
      "priority": "P0",
      "description": "业务规则描述",
      "steps": [
        {{
          "name": "步骤名",
          "method": "POST",
          "url": "${{BASE_URL}}/api/xxx",
          "headers": {{}},
          "body": {{}},
          "group": "分组名(可选)",
          "assertions": [{{"type":"status","operator":"==","value":200}}],
          "variables_extract": {{"token": "data.token"}}
        }}
      ]
    }}
  ]
}}
```

{quality_rules}"""},
        {"role": "user", "content": f"""请根据以下接口定义生成测试场景：

{full_api_info}

请严格按 JSON 格式输出，不要输出其他内容。"""},
    ]

    full_content = ""
    try:
        async for chunk in llm_client.stream(messages, config=ai_config):
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
    for sc in parsed:
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
            created_by=user_id,
        )
        session.add(scenario)
        await session.flush()

        for i, step in enumerate(sc.get("steps", [])):
            session.add(ApiTestStep(
                scenario_id=scenario.id,
                sort_order=i,
                group_name=step.get("group"),
                name=step.get("name", f"步骤{i+1}"),
                method=step.get("method", "GET"),
                url=step.get("url", ""),
                headers=step.get("headers"),
                body=step.get("body"),
                assertions=step.get("assertions", []),
                variables_extract=step.get("variables_extract"),
            ))

        created_ids.append(str(scenario.id))
        code_seq += 1

        yield GenEvent(type="scenario_created", data={
            "id": str(scenario.id),
            "code": scenario.code,
            "title": scenario.title,
            "priority": scenario.priority,
            "stepCount": len(sc.get("steps", [])),
        })

    await session.commit()

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
