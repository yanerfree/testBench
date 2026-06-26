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

    # 保存旧版本到 versions 目录
    versions_dir = SKILLS_DIR / skill_name / "versions"
    versions_dir.mkdir(exist_ok=True)
    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    old_content = skill_file.read_text(encoding="utf-8")
    (versions_dir / f"SKILL_{ts}.md").write_text(old_content, encoding="utf-8")

    skill_file.write_text(content, encoding="utf-8")
    logger.info("Skill '%s' updated, length=%d, version saved as %s", skill_name, len(content), ts)
    return {"data": {"name": skill_name, "updated": True, "versionBackup": ts}}


@router.get("/{skill_name}/versions")
async def list_skill_versions(skill_name: str):
    versions_dir = SKILLS_DIR / skill_name / "versions"
    if not versions_dir.exists():
        return {"data": []}
    versions = []
    for f in sorted(versions_dir.glob("SKILL_*.md"), reverse=True):
        versions.append({
            "filename": f.name,
            "timestamp": f.name.replace("SKILL_", "").replace(".md", ""),
            "size": f.stat().st_size,
        })
    return {"data": versions}


@router.post("/{skill_name}/rollback/{version_ts}")
async def rollback_skill(skill_name: str, version_ts: str):
    skill_file = SKILLS_DIR / skill_name / "SKILL.md"
    version_file = SKILLS_DIR / skill_name / "versions" / f"SKILL_{version_ts}.md"
    if not version_file.exists():
        return {"error": f"版本 {version_ts} 不存在"}

    # 先备份当前版本
    versions_dir = SKILLS_DIR / skill_name / "versions"
    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    (versions_dir / f"SKILL_{ts}.md").write_text(skill_file.read_text(encoding="utf-8"), encoding="utf-8")

    # 回滚
    skill_file.write_text(version_file.read_text(encoding="utf-8"), encoding="utf-8")
    logger.info("Skill '%s' rolled back to %s", skill_name, version_ts)
    return {"data": {"name": skill_name, "rolledBackTo": version_ts}}
