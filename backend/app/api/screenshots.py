"""截图上传 API — 供探索测试和文档生成使用"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Depends

from app.deps.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/screenshots", tags=["screenshots"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "screenshots"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_screenshot(
    file: UploadFile = File(...),
    project_id: str | None = None,
    session_id: str | None = None,
    current_user: User = Depends(get_current_user),
):
    ext = Path(file.filename or "img.png").suffix or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"

    sub_dir = UPLOAD_DIR
    if project_id:
        sub_dir = sub_dir / project_id
    if session_id:
        sub_dir = sub_dir / session_id
    sub_dir.mkdir(parents=True, exist_ok=True)

    file_path = sub_dir / filename
    content = await file.read()
    file_path.write_bytes(content)

    relative_path = str(file_path.relative_to(UPLOAD_DIR))
    url = f"/api/screenshots/files/{relative_path}"

    return {
        "data": {
            "url": url,
            "filename": filename,
            "size": len(content),
        }
    }


@router.get("/files/{path:path}")
async def serve_screenshot(path: str):
    from fastapi.responses import FileResponse
    file_path = UPLOAD_DIR / path
    if not file_path.exists() or not file_path.is_file():
        from app.core.exceptions import NotFoundError
        raise NotFoundError(code="NOT_FOUND", message="截图不存在")
    return FileResponse(file_path)
