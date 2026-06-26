"""Skill 管理 API — 列表 + 查看 + 编辑"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["skills"])

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills" / "preset"


@router.get("")
async def list_skills():
    skills = []
    if SKILLS_DIR.exists():
        for skill_dir in sorted(SKILLS_DIR.iterdir()):
            skill_file = skill_dir / "SKILL.md"
            if skill_file.exists():
                content = skill_file.read_text(encoding="utf-8")
                import re, yaml
                fm_match = re.match(r"^---\s*\n(.+?)\n---\s*\n", content, re.DOTALL)
                meta = yaml.safe_load(fm_match.group(1)) if fm_match else {}
                skills.append({
                    "name": meta.get("name", skill_dir.name),
                    "description": meta.get("description", ""),
                    "version": meta.get("version", 1),
                    "tools": meta.get("tools", []),
                    "contentLength": len(content),
                })
    return {"data": skills}


@router.get("/{skill_name}")
async def get_skill(skill_name: str):
    skill_file = SKILLS_DIR / skill_name / "SKILL.md"
    if not skill_file.exists():
        return {"data": None, "error": f"Skill '{skill_name}' 不存在"}
    return {"data": {"name": skill_name, "content": skill_file.read_text(encoding="utf-8")}}


@router.put("/{skill_name}")
async def update_skill(skill_name: str, body: dict):
    skill_file = SKILLS_DIR / skill_name / "SKILL.md"
    if not skill_file.exists():
        return {"data": None, "error": f"Skill '{skill_name}' 不存在"}
    content = body.get("content", "")
    if not content.strip():
        return {"error": "内容不能为空"}
    skill_file.write_text(content, encoding="utf-8")
    logger.info("Skill '%s' updated, length=%d", skill_name, len(content))
    return {"data": {"name": skill_name, "updated": True}}
