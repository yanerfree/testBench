"""工具箱 API — 为前端工具箱提供 AI 辅助能力"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/toolbox", tags=["toolbox"])


class RegexGenRequest(BaseModel):
    description: str = Field(..., max_length=500)


@router.post("/generate-regex")
async def generate_regex(body: RegexGenRequest):
    try:
        from app.services.ai.llm_client import complete
        resp = await complete(
            messages=[
                {"role": "system", "content": (
                    "你是一个正则表达式专家。用户会用自然语言描述需求，你需要返回对应的 JavaScript 正则表达式。\n"
                    "要求：\n"
                    "1. 只返回正则表达式本身，不要加 / 包裹\n"
                    "2. 同时给出简短说明\n"
                    "3. 严格按以下 JSON 格式返回，不要有其他内容：\n"
                    '{"regex": "正则表达式", "flags": "标志位", "explanation": "简短说明"}'
                )},
                {"role": "user", "content": body.description},
            ],
            max_tokens=200,
        )
        import json
        try:
            text = resp.content.strip()
            if text.startswith("```"): text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(text)
            return {"data": data}
        except (json.JSONDecodeError, IndexError):
            return {"data": {"regex": resp.content.strip(), "flags": "g", "explanation": ""}}
    except Exception as e:
        logger.warning("正则生成失败: %s", e)
        return {"error": str(e)[:200]}
