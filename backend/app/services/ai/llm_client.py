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


def _build_headers(*, config=None) -> dict[str, str]:
    headers: dict[str, str] = {
        "User-Agent": "claude-cli/1.0",
    }
    auth_token = config.auth_token if config else settings.ai_auth_token
    api_key = config.api_key if config else settings.ai_api_key
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    elif api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _build_openai_body(
    messages: list[dict],
    *,
    stream: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    config=None,
) -> dict:
    return {
        "model": model or (config.model if config else settings.ai_model),
        "messages": messages,
        "max_tokens": max_tokens or (config.max_tokens if config else settings.ai_max_tokens),
        "temperature": temperature if temperature is not None else (config.temperature if config else settings.ai_temperature),
        "stream": stream,
    }


def _build_anthropic_body(
    messages: list[dict],
    *,
    stream: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    config=None,
) -> dict:
    system_parts = []
    chat_messages = []
    for m in messages:
        if m["role"] == "system":
            system_parts.append(m["content"])
        else:
            chat_messages.append({"role": m["role"], "content": m["content"]})

    body: dict = {
        "model": model or (config.model if config else settings.ai_model),
        "messages": chat_messages,
        "max_tokens": max_tokens or (config.max_tokens if config else settings.ai_max_tokens),
        "temperature": temperature if temperature is not None else (config.temperature if config else settings.ai_temperature),
        "stream": stream,
    }
    if system_parts:
        body["system"] = "\n\n".join(system_parts)
    return body


def _get_endpoint(*, config=None) -> str:
    provider = config.provider if config else settings.ai_provider
    base_url = config.base_url if config else settings.ai_base_url
    base = base_url.rstrip("/")
    if provider == "anthropic":
        return f"{base}/messages" if base else "https://api.anthropic.com/v1/messages"
    return f"{base}/chat/completions"


def _get_extra_headers(*, config=None) -> dict[str, str]:
    provider = config.provider if config else settings.ai_provider
    if provider == "anthropic":
        h = {"anthropic-version": "2023-06-01", "content-type": "application/json"}
        api_key = config.api_key if config else settings.ai_api_key
        if api_key:
            h["x-api-key"] = api_key
        return h
    return {"content-type": "application/json"}


def _get_timeout(*, config=None) -> int:
    return config.timeout_seconds if config else settings.ai_timeout_seconds


def _get_provider(*, config=None) -> str:
    return config.provider if config else settings.ai_provider


async def complete(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    config=None,
) -> LLMResponse:
    provider = _get_provider(config=config)
    if provider == "anthropic":
        body = _build_anthropic_body(messages, model=model, max_tokens=max_tokens, temperature=temperature, config=config)
    else:
        body = _build_openai_body(messages, model=model, max_tokens=max_tokens, temperature=temperature, config=config)

    headers = {**_build_headers(config=config), **_get_extra_headers(config=config)}
    endpoint = _get_endpoint(config=config)

    async with httpx.AsyncClient(timeout=_get_timeout(config=config)) as client:
        resp = await client.post(endpoint, json=body, headers=headers)
        if resp.status_code != 200:
            raise LLMError(f"LLM API error: {resp.status_code} {resp.text[:500]}", resp.status_code)
        data = resp.json()

    if provider == "anthropic":
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
    config=None,
) -> AsyncIterator[StreamChunk]:
    provider = _get_provider(config=config)
    if provider == "anthropic":
        body = _build_anthropic_body(messages, stream=True, model=model, max_tokens=max_tokens, temperature=temperature, config=config)
    else:
        body = _build_openai_body(messages, stream=True, model=model, max_tokens=max_tokens, temperature=temperature, config=config)

    headers = {**_build_headers(config=config), **_get_extra_headers(config=config)}
    endpoint = _get_endpoint(config=config)

    async with httpx.AsyncClient(timeout=_get_timeout(config=config)) as client:
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

                    chunk = _parse_stream_chunk(data, provider=provider)
                    if chunk.delta or chunk.finish_reason:
                        yield chunk


def _parse_stream_chunk(data: dict, *, provider: str | None = None) -> StreamChunk:
    p = provider or settings.ai_provider
    if p == "anthropic":
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
