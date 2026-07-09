"""
test_llm_structured — 结构化输出封装（ft-1-3 / ADR-4）
Test ID: FT.1.3-UNIT-001
Priority: P0

用 llm_client stub 单测四路径：合法/非法/重试成功/重试耗尽。
"""
from __future__ import annotations
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import BaseModel, Field

from app.services.scenario_gen.llm_structured import (
    StructuredOutputError,
    extract_json,
    llm_structured,
)
from app.services.ai.llm_client import LLMResponse


class SampleSchema(BaseModel):
    title: str = Field(min_length=1)
    priority: str = Field(pattern=r"^P[0-3]$")


@dataclass
class FakeConfig:
    model: str = "test-model"
    provider: str = "openai_compatible"
    base_url: str = "http://test"
    api_key: str = "key"
    auth_token: str | None = None
    temperature: float = 0.0
    max_tokens: int = 4096
    timeout_seconds: int = 30
    source: str = "env"


VALID_JSON = '{"title": "登录测试", "priority": "P0"}'
INVALID_JSON_THEN_VALID = [
    '{"title": "", "priority": "P0"}',   # title min_length=1 违规
    VALID_JSON,                           # 重试后修正
]
ALWAYS_INVALID = '{"title": "", "priority": "PX"}'


class TestExtractJson:

    def test_code_block(self):
        text = 'blah\n```json\n{"a":1}\n```\nmore'
        assert extract_json(text) == '{"a":1}'

    def test_bare_json(self):
        text = 'result: {"a":1} done'
        assert extract_json(text) == '{"a":1}'

    def test_array(self):
        text = 'here [1,2,3] end'
        assert extract_json(text) == '[1,2,3]'

    def test_no_json(self):
        assert extract_json("no json here") == "no json here"


class TestLlmStructured:

    @pytest.mark.asyncio
    async def test_valid_first_try(self):
        mock_complete = AsyncMock(return_value=LLMResponse(content=VALID_JSON, prompt_tokens=10, completion_tokens=5))
        with patch("app.services.scenario_gen.llm_structured.llm_client.complete", mock_complete):
            result = await llm_structured(
                FakeConfig(), [{"role": "user", "content": "test"}], SampleSchema,
            )
        assert result.title == "登录测试"
        assert result.priority == "P0"
        assert mock_complete.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_success(self):
        responses = [
            LLMResponse(content=INVALID_JSON_THEN_VALID[0], prompt_tokens=10, completion_tokens=5),
            LLMResponse(content=INVALID_JSON_THEN_VALID[1], prompt_tokens=8, completion_tokens=5),
        ]
        mock_complete = AsyncMock(side_effect=responses)
        with patch("app.services.scenario_gen.llm_structured.llm_client.complete", mock_complete):
            result = await llm_structured(
                FakeConfig(),
                [{"role": "system", "content": "sys"}, {"role": "user", "content": "test"}],
                SampleSchema,
            )
        assert result.title == "登录测试"
        assert mock_complete.call_count == 2
        # fix 轮 messages 应只有 4 条（system + 原始 user + assistant 上轮 + fix user），不累积
        fix_call_args = mock_complete.call_args_list[1]
        fix_messages = fix_call_args.kwargs.get("messages") if "messages" in fix_call_args.kwargs else fix_call_args.args[0]
        assert len(fix_messages) == 4

    @pytest.mark.asyncio
    async def test_retry_exhausted_raises(self):
        mock_complete = AsyncMock(
            return_value=LLMResponse(content=ALWAYS_INVALID, prompt_tokens=10, completion_tokens=5),
        )
        with patch("app.services.scenario_gen.llm_structured.llm_client.complete", mock_complete):
            with pytest.raises(StructuredOutputError) as exc_info:
                await llm_structured(
                    FakeConfig(), [{"role": "user", "content": "test"}], SampleSchema,
                )
        assert "校验失败" in str(exc_info.value)
        assert exc_info.value.raw_content == ALWAYS_INVALID
        assert mock_complete.call_count == 3  # 1 原始 + 2 重试

    @pytest.mark.asyncio
    async def test_non_json_output_retries(self):
        responses = [
            LLMResponse(content="这不是JSON，让我想想...", prompt_tokens=10, completion_tokens=5),
            LLMResponse(content=VALID_JSON, prompt_tokens=8, completion_tokens=5),
        ]
        mock_complete = AsyncMock(side_effect=responses)
        with patch("app.services.scenario_gen.llm_structured.llm_client.complete", mock_complete):
            result = await llm_structured(
                FakeConfig(), [{"role": "user", "content": "test"}], SampleSchema,
            )
        assert result.title == "登录测试"
        assert mock_complete.call_count == 2
