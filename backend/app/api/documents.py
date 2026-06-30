"""文档管理 API — CRUD + AI 生成"""
from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import BaseSchema
from app.core.exceptions import NotFoundError
from app.deps.auth import get_current_user, require_project_role
from app.deps.db import get_db
from app.models.user import User
from app.models.document import Document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects/{project_id}/documents", tags=["documents"])


class CreateDocRequest(BaseSchema):
    title: str = Field(..., min_length=1, max_length=200)
    doc_type: str = Field(default="manual", pattern="^(manual|acceptance|training)$")
    source_case_ids: list[str] | None = None


class GenerateDocRequest(BaseSchema):
    title: str = Field(..., min_length=1, max_length=200)
    doc_type: str = Field(default="manual")
    folder_id: str | None = None
    additional_info: str | None = None


def _doc_to_dict(d: Document) -> dict:
    return {
        "id": str(d.id),
        "title": d.title,
        "docType": d.doc_type,
        "content": d.content,
        "sourceCaseIds": d.source_case_ids,
        "status": d.status,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
        "updatedAt": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("")
async def list_documents(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(Document).where(Document.project_id == project_id).order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return {"data": [_doc_to_dict(d) for d in docs]}


@router.get("/{doc_id}")
async def get_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await session.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="文档不存在")
    return {"data": _doc_to_dict(doc)}


@router.delete("/{doc_id}")
async def delete_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer")),
):
    doc = await session.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="文档不存在")
    await session.delete(doc)
    await session.commit()
    return {"data": {"deleted": True}}


@router.post("/generate")
async def generate_document(
    project_id: uuid.UUID,
    body: GenerateDocRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    from app.services.ai_config_resolver import resolve_ai_config
    from app.services.ai import llm_client
    from app.mcp.tools import test_cases, api_endpoints
    from app.core.exceptions import AppError

    ai_config = await resolve_ai_config(project_id, session)
    if not ai_config:
        raise AppError(code="AI_NOT_CONFIGURED", message="AI 服务未配置", status_code=503)

    # 获取项目默认分支
    from sqlalchemy import select as sa_select
    from app.models.project import Branch
    branch_result = await session.execute(
        sa_select(Branch).where(Branch.project_id == project_id, Branch.status == "active").limit(1)
    )
    branch = branch_result.scalar_one_or_none()
    branch_id = str(branch.id) if branch else None

    cases_text = "（无用例数据）"
    if branch_id:
        cases_result = await test_cases.list_cases(session, branch_id, page_size=100,
            folder_id=body.folder_id)
        cases = cases_result.get("cases", [])
        if cases:
            lines = []
            for c in cases[:40]:
                steps_text = " → ".join(s.get("action", "") for s in c.get("steps", [])[:5])
                lines.append(f"### {c['title']}\n前置: {c.get('preconditions','无')}\n步骤: {steps_text}\n预期: {c.get('expectedResult','')}")
            cases_text = "\n\n".join(lines)

    api_tree = await api_endpoints.list_api_tree(session, str(project_id))
    api_text = "\n".join(f"- {n.get('method','GET')} {n.get('url','')} ({n.get('name','')})" for n in api_tree if n.get("type") == "endpoint")[:15] or "（无 API 接口）"

    DOC_TYPE_LABELS = {"manual": "操作手册", "acceptance": "验收文档", "training": "培训教材"}
    doc_label = DOC_TYPE_LABELS.get(body.doc_type, "操作手册")

    business_context = body.additional_info or ""
    case_count = len(cases_result.get("cases", [])) if branch_id else 0

    messages = [
        {"role": "system", "content": f"你是技术文档专家。根据测试用例和业务背景生成{doc_label}。要求：\n- 基于用例步骤整理成操作说明，不要凭空编造功能\n- 每个操作章节对应一组相关用例\n- 步骤要具体到按钮名称、输入内容、预期结果\n- 输出完整 Markdown，结构清晰"},
        {"role": "user", "content": f"""请根据以下信息生成一份【{doc_label}】：

标题：{body.title}
用例数量：{case_count} 条

{f'## 业务背景（用户提供）{chr(10)}{business_context}' if business_context else ''}

## 测试用例（文档素材，共 {case_count} 条）
{cases_text}

## API 接口
{api_text}

请生成完整的 Markdown 文档。"""},
    ]

    doc = Document(
        project_id=project_id,
        title=body.title,
        doc_type=body.doc_type,
        status="draft",
        created_by=current_user.id,
    )
    session.add(doc)
    await session.flush()
    doc_id = doc.id

    async def event_stream():
        full = ""
        try:
            async for chunk in llm_client.stream(messages, config=ai_config):
                if chunk.delta:
                    full += chunk.delta
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk.delta}, ensure_ascii=False)}\n\n"

            doc.content = full
            doc.status = "published"
            await session.commit()

            yield f"data: {json.dumps({'type': 'done', 'docId': str(doc_id), 'title': body.title}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:200]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


class GenerateWithScreenshotsRequest(BaseSchema):
    system_url: str = Field(..., min_length=1)
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1, max_length=200)
    doc_type: str = Field(default="manual")
    modules: str | None = None
    audience: str | None = None
    output_dir: str | None = None
    business_context: str | None = None


@router.post("/generate-with-screenshots")
async def generate_with_screenshots(
    project_id: uuid.UUID,
    body: GenerateWithScreenshotsRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_role("project_admin", "developer", "tester")),
):
    from app.services.ai_config_resolver import resolve_ai_config
    from app.core.exceptions import AppError

    ai_config = await resolve_ai_config(project_id, session)
    if not ai_config:
        raise AppError(code="AI_NOT_CONFIGURED", message="AI 服务未配置", status_code=503)

    doc = Document(
        project_id=project_id,
        title=body.title,
        doc_type=body.doc_type,
        status="draft",
        created_by=current_user.id,
    )
    session.add(doc)
    await session.flush()
    doc_id = doc.id

    from app.services.doc_generator import generate_doc_with_screenshots

    async def event_stream():
        full_content = ""
        try:
            async for event in generate_doc_with_screenshots(
                system_url=body.system_url,
                username=body.username,
                password=body.password,
                title=body.title,
                doc_type=body.doc_type,
                modules=body.modules,
                audience=body.audience,
                business_context=body.business_context,
                ai_config=ai_config,
                project_id=project_id,
            ):
                if event.type == "chunk":
                    full_content += event.data.get("content", "")
                yield f"data: {json.dumps({'type': event.type, **event.data}, ensure_ascii=False)}\n\n"

            if full_content:
                doc.content = full_content
                doc.status = "published"
                await session.commit()

            yield f"data: {json.dumps({'type': 'done', 'docId': str(doc_id)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:200]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/{doc_id}/export-html")
async def export_html(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出 HTML — 图片转 base64 内嵌，单文件可离线查看"""
    import re, base64
    from pathlib import Path
    from fastapi.responses import Response

    doc = await session.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="文档不存在")

    content = doc.content or ""
    SCREENSHOT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "screenshots"

    def replace_img(match):
        img_path = match.group(2)
        relative = img_path.replace("/api/screenshots/files/", "")
        full_path = SCREENSHOT_DIR / relative
        if full_path.exists():
            b64 = base64.b64encode(full_path.read_bytes()).decode()
            ext = full_path.suffix.lstrip(".")
            return f"data:image/{ext};base64,{b64}"
        return img_path

    # 先逐个替换图片为 base64 img 标签
    html_body = content
    for m in re.finditer(r'!\[([^\]]*)\]\(([^)]+)\)', content):
        alt = m.group(1)
        img_path = m.group(2)
        relative = img_path.replace("/api/screenshots/files/", "")
        full_path = SCREENSHOT_DIR / relative
        if full_path.exists():
            b64 = base64.b64encode(full_path.read_bytes()).decode()
            ext = full_path.suffix.lstrip(".")
            src = f"data:image/{ext};base64,{b64}"
        else:
            src = img_path
        img_tag = f'<img src="{src}" alt="{alt}" style="max-width:100%;border:1px solid #eee;border-radius:6px;margin:8px 0">'
        html_body = html_body.replace(m.group(0), img_tag, 1)

    # 文本格式转换
    html_body = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html_body, flags=re.MULTILINE)
    html_body = re.sub(r'^## (.+)$', r'<h2 style="border-bottom:1px solid #eee;padding-bottom:6px;margin-top:30px">\1</h2>', html_body, flags=re.MULTILINE)
    html_body = re.sub(r'^# (.+)$', r'<h1 style="border-bottom:2px solid #eee;padding-bottom:10px">\1</h1>', html_body, flags=re.MULTILINE)
    html_body = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', html_body)
    html_body = re.sub(r'^- (.+)$', r'<div style="padding-left:16px">• \1</div>', html_body, flags=re.MULTILINE)
    html_body = html_body.replace("\n\n", "<br/><br/>").replace("\n", "<br/>")

    full_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>{doc.title}</title>
<style>
body {{ max-width:900px; margin:40px auto; padding:0 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#333; line-height:1.8; }}
img {{ max-width:100%; border:1px solid #eee; border-radius:6px; margin:8px 0; }}
</style></head>
<body>{html_body}
<hr style="margin-top:40px;border:none;border-top:1px solid #eee">
<p style="font-size:12px;color:#999">由 testBench 测试管理平台生成</p>
</body></html>"""

    from urllib.parse import quote
    return Response(
        content=full_html.encode("utf-8"),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(doc.title)}.html"},
    )


@router.get("/{doc_id}/export-zip")
async def export_zip(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """打包下载 — Markdown + 截图文件夹"""
    import re, zipfile, io
    from pathlib import Path
    from fastapi.responses import StreamingResponse as ZipResponse

    doc = await session.get(Document, doc_id)
    if not doc or doc.project_id != project_id:
        raise NotFoundError(code="NOT_FOUND", message="文档不存在")

    content = doc.content or ""
    SCREENSHOT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "screenshots"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # 替换图片路径为相对路径，同时收集文件
        def fix_path(match):
            alt = match.group(1)
            img_path = match.group(2)
            relative = img_path.replace("/api/screenshots/files/", "")
            full_path = SCREENSHOT_DIR / relative
            filename = Path(relative).name
            local_path = f"images/{filename}"
            if full_path.exists():
                zf.writestr(local_path, full_path.read_bytes())
            return f"![{alt}]({local_path})"

        fixed_content = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', fix_path, content)
        zf.writestr(f"{doc.title}.md", fixed_content.encode("utf-8"))

    buf.seek(0)
    from urllib.parse import quote
    return ZipResponse(
        content=buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(doc.title)}.zip"},
    )
