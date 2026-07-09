"""功能场景测试模块 — LLM 结构化输出统一封装（ft-1-3 / ADR-4）

四个 LLM 调用环节共用：需求提取 / 场景建模 / 用例展开 / AI 自评。
- Pydantic schema 校验
- 校验失败定向重试（≤ max_retry，读阈值配置）
- fix 轮上下文裁剪：只保留 system + 原始请求 + 错误（防膨胀，ThemisAI dry_run 实测教训）
- AIUsageLog 记账

禁止从自由文本尾部捞 JSON（Aemeath 100+ 行打捞启发式的反面教训）。
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_file import AIUsageLog
from app.services.ai import llm_client
from app.services.ai.llm_client import LLMError, LLMResponse
from app.services.scenario_gen.settings import ScenarioGenDefaults, get_settings

logger = logging.getLogger("scenario_gen.llm")

T = TypeVar("T", bound=BaseModel)


class StructuredOutputError(Exception):
    """校验重试耗尽后抛出，携带最后一次校验错误与原始响应"""
    def __init__(self, message: str, last_error: Exception | None = None, raw_content: str = ""):
        super().__init__(message)
        self.last_error = last_error
        self.raw_content = raw_content


# ── JSON 提取 ──────────────────────────────────────────────────────

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*\n?(.*?)```", re.DOTALL)


def extract_json(text: str) -> str:
    """从 LLM 输出提取 JSON 文本。

    优先取 ```json 代码块；无代码块时取首个 { 到最后一个 } 的范围。
    不做多轮试探性 parse —— 如果这都提不到，让 Pydantic 报错并走重试。
    """
    m = _JSON_BLOCK_RE.search(text)
    if m:
        return m.group(1).strip()
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        return text[first:last + 1]
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    if first_bracket != -1 and last_bracket > first_bracket:
        return text[first_bracket:last_bracket + 1]
    return text.strip()


# ── fix 轮 prompt 构建 ──────────────────────────────────────────────

def _build_fix_messages(
    original_messages: list[dict],
    raw_content: str,
    error: ValidationError,
) -> list[dict]:
    """构建重试 prompt：只保留 system + 原始请求 + 错误摘要。

    不累积完整对话历史——ThemisAI 实测教训：3 轮后 8K→30K 撑爆小模型。
    """
    system_msg = next((m for m in original_messages if m["role"] == "system"), None)
    user_msg = next((m for m in original_messages if m["role"] == "user"), None)

    error_summary = "; ".join(
        f"{e['loc']}: {e['msg']}" for e in error.errors()[:5]
    )
    if len(error.errors()) > 5:
        error_summary += f" ... 共 {len(error.errors())} 个错误"

    fix_messages = []
    if system_msg:
        fix_messages.append(system_msg)
    if user_msg:
        fix_messages.append(user_msg)
    fix_messages.append({
        "role": "assistant",
        "content": raw_content[:2000],
    })
    fix_messages.append({
        "role": "user",
        "content": (
            f"你上一次的输出有 JSON 结构错误，请修正后重新输出完整 JSON（不要解释，只输出 JSON）：\n\n"
            f"错误：{error_summary}"
        ),
    })
    return fix_messages


# ── 核心封装 ──────────────────────────────────────────────────────

async def llm_structured(
    config,
    messages: list[dict],
    schema: type[T],
    *,
    session: AsyncSession | None = None,
    project_id: uuid.UUID | None = None,
    skill_name: str = "scenario-gen",
    settings: ScenarioGenDefaults | None = None,
) -> T:
    """调用 LLM 并校验为 Pydantic 模型。失败定向重试，耗尽抛 StructuredOutputError。

    Args:
        config: ResolvedAIConfig
        messages: 标准 messages 列表
        schema: 期望的 Pydantic 模型类型
        session: 有则写 AIUsageLog
        project_id: AIUsageLog 归属项目
        skill_name: AIUsageLog 技能名
        settings: 阈值配置（不传则取默认）
    """
    cfg = settings or get_settings()
    max_retry = cfg.structured_output_max_retry
    original_messages = messages
    last_error: Exception | None = None
    raw_content = ""
    total_prompt_tokens = 0
    total_completion_tokens = 0
    start_time = time.monotonic()

    for attempt in range(max_retry + 1):
        try:
            resp: LLMResponse = await llm_client.complete(messages, config=config)
        except LLMError:
            raise  # LLM 网络/鉴权错误直接抛，不重试

        raw_content = resp.content
        total_prompt_tokens += resp.prompt_tokens
        total_completion_tokens += resp.completion_tokens

        try:
            json_text = extract_json(raw_content)
            result = schema.model_validate_json(json_text)
            _log_usage(session, project_id, skill_name, config, total_prompt_tokens, total_completion_tokens, start_time, attempt)
            return result
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_error = e
            if attempt < max_retry:
                if isinstance(e, ValidationError):
                    messages = _build_fix_messages(original_messages, raw_content, e)
                else:
                    messages = _build_fix_messages(
                        original_messages, raw_content,
                        ValidationError.from_exception_data(
                            title=schema.__name__,
                            line_errors=[{"type": "value_error", "loc": (), "msg": str(e), "input": raw_content[:200], "ctx": {}}],
                        ) if False else _build_json_error_fix(original_messages, raw_content, e),
                    )
                logger.info(
                    "llm_structured 校验失败(attempt %d/%d): %s — 定向重试",
                    attempt + 1, max_retry + 1, str(e)[:200],
                )

    _log_usage(session, project_id, skill_name, config, total_prompt_tokens, total_completion_tokens, start_time, max_retry)
    raise StructuredOutputError(
        f"{schema.__name__} 校验失败（已重试 {max_retry} 次）: {last_error}",
        last_error=last_error,
        raw_content=raw_content,
    )


def _build_json_error_fix(
    original_messages: list[dict],
    raw_content: str,
    error: Exception,
) -> list[dict]:
    """JSON 解析错误（非 Pydantic）的 fix prompt"""
    system_msg = next((m for m in original_messages if m["role"] == "system"), None)
    user_msg = next((m for m in original_messages if m["role"] == "user"), None)
    fix = []
    if system_msg:
        fix.append(system_msg)
    if user_msg:
        fix.append(user_msg)
    fix.append({"role": "assistant", "content": raw_content[:2000]})
    fix.append({
        "role": "user",
        "content": f"你上一次的输出不是合法 JSON，请修正后重新输出完整 JSON（不要解释，只输出 JSON）：\n\n错误：{error}",
    })
    return fix


def _log_usage(
    session: AsyncSession | None,
    project_id: uuid.UUID | None,
    skill_name: str,
    config,
    prompt_tokens: int,
    completion_tokens: int,
    start_time: float,
    attempts: int,
):
    if session is None or project_id is None:
        return
    duration_ms = int((time.monotonic() - start_time) * 1000)
    try:
        session.add(AIUsageLog(
            project_id=project_id,
            skill_name=skill_name,
            model=getattr(config, "model", None),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            duration_ms=duration_ms,
        ))
    except Exception as e:
        logger.warning("AIUsageLog 写入失败（不阻塞）: %s", e)
