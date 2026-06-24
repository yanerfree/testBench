"""LLM 客户端 — 基于 httpx 的流式/非流式调用，支持 OpenAI 兼容和 Anthropic API"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import AsyncIterator

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class StreamChunk:
    delta: str = ""
    finish_reason: str | None = None


@dataclass
class LLMResponse:
    content: str = ""
    finish_reason: str = "stop"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""


class LLMError(Exception):
    def __init__(self, message: str, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


def _build_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if settings.ai_auth_token:
        headers["Authorization"] = f"Bearer {settings.ai_auth_token}"
    elif settings.ai_api_key:
        headers["Authorization"] = f"Bearer {settings.ai_api_key}"
    return headers


def _build_openai_body(
    messages: list[dict],
    *,
    stream: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> dict:
    return {
        "model": model or settings.ai_model,
        "messages": messages,
        "max_tokens": max_tokens or settings.ai_max_tokens,
        "temperature": temperature if temperature is not None else settings.ai_temperature,
        "stream": stream,
    }


def _build_anthropic_body(
    messages: list[dict],
    *,
    stream: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> dict:
    system_parts = []
    chat_messages = []
    for m in messages:
        if m["role"] == "system":
            system_parts.append(m["content"])
        else:
            chat_messages.append({"role": m["role"], "content": m["content"]})

    body: dict = {
        "model": model or settings.ai_model,
        "messages": chat_messages,
        "max_tokens": max_tokens or settings.ai_max_tokens,
        "temperature": temperature if temperature is not None else settings.ai_temperature,
        "stream": stream,
    }
    if system_parts:
        body["system"] = "\n\n".join(system_parts)
    return body


def _get_endpoint() -> str:
    base = settings.ai_base_url.rstrip("/")
    if settings.ai_provider == "anthropic":
        return f"{base}/messages" if base else "https://api.anthropic.com/v1/messages"
    return f"{base}/chat/completions"


def _get_extra_headers() -> dict[str, str]:
    if settings.ai_provider == "anthropic":
        h = {"anthropic-version": "2023-06-01", "content-type": "application/json"}
        if settings.ai_api_key:
            h["x-api-key"] = settings.ai_api_key
        return h
    return {"content-type": "application/json"}


async def complete(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> LLMResponse:
    if settings.ai_provider == "anthropic":
        body = _build_anthropic_body(messages, model=model, max_tokens=max_tokens, temperature=temperature)
    else:
        body = _build_openai_body(messages, model=model, max_tokens=max_tokens, temperature=temperature)

    headers = {**_build_headers(), **_get_extra_headers()}
    endpoint = _get_endpoint()

    async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
        resp = await client.post(endpoint, json=body, headers=headers)
        if resp.status_code != 200:
            raise LLMError(f"LLM API error: {resp.status_code} {resp.text[:500]}", resp.status_code)
        data = resp.json()

    if settings.ai_provider == "anthropic":
        content = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                content += block.get("text", "")
        return LLMResponse(
            content=content,
            finish_reason=data.get("stop_reason", "end_turn"),
            prompt_tokens=data.get("usage", {}).get("input_tokens", 0),
            completion_tokens=data.get("usage", {}).get("output_tokens", 0),
            model=data.get("model", ""),
        )

    choice = data.get("choices", [{}])[0]
    usage = data.get("usage", {})
    return LLMResponse(
        content=choice.get("message", {}).get("content", ""),
        finish_reason=choice.get("finish_reason", "stop"),
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
        model=data.get("model", ""),
    )


async def stream(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> AsyncIterator[StreamChunk]:
    if settings.ai_provider == "anthropic":
        body = _build_anthropic_body(messages, stream=True, model=model, max_tokens=max_tokens, temperature=temperature)
    else:
        body = _build_openai_body(messages, stream=True, model=model, max_tokens=max_tokens, temperature=temperature)

    headers = {**_build_headers(), **_get_extra_headers()}
    endpoint = _get_endpoint()

    async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
        async with client.stream("POST", endpoint, json=body, headers=headers) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise LLMError(f"LLM API error: {resp.status_code} {error_body.decode()[:500]}", resp.status_code)

            buffer = ""
            async for raw_bytes in resp.aiter_bytes():
                buffer += raw_bytes.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line or line.startswith(":"):
                        continue
                    if line == "data: [DONE]":
                        return
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]

                    try:
                        data = json.loads(payload)
                    except json.JSONDecodeError:
                        logger.warning("Failed to parse SSE chunk: %s", payload[:200])
                        continue

                    chunk = _parse_stream_chunk(data)
                    if chunk.delta or chunk.finish_reason:
                        yield chunk


def _parse_stream_chunk(data: dict) -> StreamChunk:
    if settings.ai_provider == "anthropic":
        event_type = data.get("type", "")
        if event_type == "content_block_delta":
            delta = data.get("delta", {})
            return StreamChunk(delta=delta.get("text", ""))
        if event_type == "message_delta":
            return StreamChunk(finish_reason=data.get("delta", {}).get("stop_reason"))
        return StreamChunk()

    choices = data.get("choices", [])
    if not choices:
        return StreamChunk()
    choice = choices[0]
    delta = choice.get("delta", {})
    return StreamChunk(
        delta=delta.get("content", "") or "",
        finish_reason=choice.get("finish_reason"),
    )
