"""场景模型生成（ft S3.1 / FR7-FR8 / FR52 / ADR-4）

基于需求点生成四区块场景模型：
- 业务流程步骤
- 状态转换表
- 角色权限矩阵
- 测试点清单（维度用封闭白名单枚举，落库时校验兜底）
"""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scenario_gen import GenerationTask, RequirementPoint, ScenarioModel
from app.services.scenario_gen.llm_structured import llm_structured
from app.services.scenario_gen.settings import get_settings

DIMENSION_WHITELIST = {"positive", "negative", "boundary", "permission", "data", "state"}


class FlowStep(BaseModel):
    seq: int
    action: str
    actor: str = ""
    note: str = ""


class StateTransition(BaseModel):
    from_state: str = Field(alias="from")
    to_state: str = Field(alias="to")
    trigger: str = ""
    requirement_point: str = ""

    class Config:
        populate_by_name = True


class RolePermission(BaseModel):
    role: str
    action: str
    allowed: bool = True


class TestPoint(BaseModel):
    ref: str = ""
    requirement_point_code: str
    dimension: str
    priority: str = "P1"
    title: str
    note: str = ""


class ScenarioModelResult(BaseModel):
    flows: list[FlowStep] = []
    state_transitions: list[StateTransition] = []
    role_matrix: list[RolePermission] = []
    test_points: list[TestPoint] = []


MODELER_SYSTEM_PROMPT = """你是一位资深测试架构师。根据提供的需求点清单，生成完整的场景模型。

场景模型包含四个区块：
1. **flows**: 业务流程步骤 [{seq, action, actor, note}]
2. **state_transitions**: 状态转换表 [{from, to, trigger, requirement_point}] — from/to 是业务状态名
3. **role_matrix**: 角色权限矩阵 [{role, action, allowed}]
4. **test_points**: 测试点清单 [{ref, requirement_point_code, dimension, priority, title, note}]

测试点的 dimension 必须是以下封闭白名单之一（严禁输出白名单以外的值）：
- positive: 正向验证
- negative: 异常/反向
- boundary: 边界值
- permission: 权限
- data: 数据
- state: 状态流转

requirement_point_code 引用需求点编号（如 R1、R2）。
priority 取值 P0/P1/P2/P3。每个需求点至少有 1 个测试点。

输出严格 JSON 格式。"""


def _validate_test_points(points: list[TestPoint]) -> list[TestPoint]:
    """校验测试点维度白名单（落库兜底，FR52）。非法维度静默修正为 positive 并记 warning。"""
    for tp in points:
        if tp.dimension not in DIMENSION_WHITELIST:
            tp.dimension = "positive"
    return points


async def generate_scenario_model(
    config,
    task: GenerationTask,
    session: AsyncSession,
) -> ScenarioModel:
    """基于已确认的需求点生成四区块场景模型。"""
    result = await session.execute(
        select(RequirementPoint).where(
            RequirementPoint.task_id == task.id,
            RequirementPoint.status == "active",
        ).order_by(RequirementPoint.sort_order)
    )
    points = list(result.scalars().all())
    if not points:
        raise ValueError("无有效需求点")

    points_text = "\n".join(f"- {p.code}: {p.title}" + (f"（原文：{p.quote_text[:200]}）" if p.quote_text else "") for p in points)

    messages = [
        {"role": "system", "content": MODELER_SYSTEM_PROMPT},
        {"role": "user", "content": f"需求点清单：\n{points_text}\n\n请生成场景模型（四区块 JSON）。"},
    ]

    model_result = await llm_structured(
        config, messages, ScenarioModelResult,
        session=session, project_id=task.project_id, skill_name="scenario-model",
    )

    validated_points = _validate_test_points(model_result.test_points)

    scenario_model = ScenarioModel(
        task_id=task.id,
        flows=[s.model_dump() for s in model_result.flows],
        state_transitions=[s.model_dump(by_alias=True) for s in model_result.state_transitions],
        role_matrix=[r.model_dump() for r in model_result.role_matrix],
        test_points=[t.model_dump() for t in validated_points],
        status="draft",
    )
    session.add(scenario_model)
    await session.flush()
    return scenario_model
