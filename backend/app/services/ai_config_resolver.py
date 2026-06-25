"""AI 配置解析 — 从 DB 读取项目/系统级配置，替代 .env"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_provider_config import AIProviderConfig, ProjectAIConfig


@dataclass
class ResolvedAIConfig:
    provider: str
    base_url: str
    api_key: str | None
    auth_token: str | None
    model: str
    temperature: float
    max_tokens: int
    timeout_seconds: int
    source: str  # "project" | "system" | "env"


async def resolve_ai_config(
    project_id: uuid.UUID | None,
    session: AsyncSession,
) -> ResolvedAIConfig | None:
    """解析 AI 配置。优先级：项目选择 > 系统默认 > .env fallback"""

    # 1. 项目级：查项目激活的配置
    if project_id:
        result = await session.execute(
            select(ProjectAIConfig).where(
                ProjectAIConfig.project_id == project_id,
                ProjectAIConfig.is_active == True,
            )
        )
        project_cfg = result.scalar_one_or_none()

        if project_cfg and project_cfg.provider_config_id:
            system_cfg = await session.get(AIProviderConfig, project_cfg.provider_config_id)
            if system_cfg and system_cfg.is_enabled:
                return ResolvedAIConfig(
                    provider=system_cfg.provider,
                    base_url=system_cfg.base_url,
                    api_key=system_cfg.api_key_encrypted,
                    auth_token=system_cfg.auth_token_encrypted,
                    model=system_cfg.model,
                    temperature=system_cfg.temperature,
                    max_tokens=system_cfg.max_tokens,
                    timeout_seconds=system_cfg.timeout_seconds,
                    source="project",
                )

        if project_cfg and project_cfg.base_url:
            return ResolvedAIConfig(
                provider=project_cfg.provider or "openai_compatible",
                base_url=project_cfg.base_url,
                api_key=project_cfg.api_key_encrypted,
                auth_token=project_cfg.auth_token_encrypted,
                model=project_cfg.model or "gpt-4o",
                temperature=project_cfg.temperature or 0.3,
                max_tokens=project_cfg.max_tokens or 4096,
                timeout_seconds=project_cfg.timeout_seconds or 120,
                source="project",
            )

    # 2. 系统默认
    result = await session.execute(
        select(AIProviderConfig).where(
            AIProviderConfig.is_system_default == True,
            AIProviderConfig.is_enabled == True,
        )
    )
    system_default = result.scalar_one_or_none()
    if system_default:
        return ResolvedAIConfig(
            provider=system_default.provider,
            base_url=system_default.base_url,
            api_key=system_default.api_key_encrypted,
            auth_token=system_default.auth_token_encrypted,
            model=system_default.model,
            temperature=system_default.temperature,
            max_tokens=system_default.max_tokens,
            timeout_seconds=system_default.timeout_seconds,
            source="system",
        )

    # 3. .env fallback（向后兼容）
    if settings.ai_enabled and settings.ai_base_url:
        return ResolvedAIConfig(
            provider=settings.ai_provider,
            base_url=settings.ai_base_url,
            api_key=settings.ai_api_key or None,
            auth_token=settings.ai_auth_token or None,
            model=settings.ai_model,
            temperature=settings.ai_temperature,
            max_tokens=settings.ai_max_tokens,
            timeout_seconds=settings.ai_timeout_seconds,
            source="env",
        )

    return None
