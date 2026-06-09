"""API 接口管理 — 服务层"""

import uuid

from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_collection import ApiNode


async def list_tree(session: AsyncSession, project_id: uuid.UUID) -> list[dict]:
    """获取项目下全部节点（前端自行组装树）"""
    result = await session.execute(
        select(ApiNode)
        .where(ApiNode.project_id == project_id)
        .order_by(ApiNode.sort_order, ApiNode.created_at)
    )
    nodes = result.scalars().all()
    return [_to_dict(n) for n in nodes]


async def get_node(session: AsyncSession, node_id: uuid.UUID) -> dict | None:
    node = await session.get(ApiNode, node_id)
    return _to_dict(node) if node else None


async def create_node(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, data: dict,
) -> dict:
    node = ApiNode(
        project_id=project_id,
        parent_id=data.get("parent_id"),
        node_type=data.get("node_type", "endpoint"),
        name=data["name"],
        sort_order=data.get("sort_order", 0),
        method=data.get("method"),
        url=data.get("url"),
        params=data.get("params"),
        headers=data.get("headers"),
        body=data.get("body"),
        body_type=data.get("body_type"),
        auth=data.get("auth"),
        description=data.get("description"),
        created_by=user_id,
    )
    session.add(node)
    await session.flush()
    await session.refresh(node)
    return _to_dict(node)


async def update_node(
    session: AsyncSession, node_id: uuid.UUID, data: dict,
) -> dict | None:
    node = await session.get(ApiNode, node_id)
    if not node:
        return None
    for k, v in data.items():
        if v is not None and hasattr(node, k):
            setattr(node, k, v)
    await session.flush()
    await session.refresh(node)
    return _to_dict(node)


async def delete_node(session: AsyncSession, node_id: uuid.UUID) -> bool:
    node = await session.get(ApiNode, node_id)
    if not node:
        return False
    await session.delete(node)
    await session.flush()
    return True


async def duplicate_node(
    session: AsyncSession, node_id: uuid.UUID, user_id: uuid.UUID,
) -> dict | None:
    src = await session.get(ApiNode, node_id)
    if not src:
        return None
    node = ApiNode(
        project_id=src.project_id,
        parent_id=src.parent_id,
        node_type=src.node_type,
        name=f"{src.name} (副本)",
        sort_order=src.sort_order + 1,
        method=src.method,
        url=src.url,
        params=src.params,
        headers=src.headers,
        body=src.body,
        body_type=src.body_type,
        auth=src.auth,
        description=src.description,
        created_by=user_id,
    )
    session.add(node)
    await session.flush()
    await session.refresh(node)
    return _to_dict(node)


async def import_postman(
    session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, collection: dict,
) -> int:
    """解析 Postman Collection v2.1 JSON，导入为 api_nodes 树"""
    count = 0

    def parse_items(items: list, parent_id=None, sort=0):
        nonlocal count
        for i, item in enumerate(items):
            if "item" in item:
                folder = ApiNode(
                    project_id=project_id, parent_id=parent_id,
                    node_type="folder", name=item.get("name", "Folder"),
                    sort_order=sort + i, created_by=user_id,
                )
                session.add(folder)
                session.flush()
                parse_items(item["item"], parent_id=folder.id, sort=0)
            elif "request" in item:
                req = item["request"]
                if isinstance(req, str):
                    node = ApiNode(
                        project_id=project_id, parent_id=parent_id,
                        node_type="endpoint", name=item.get("name", "Request"),
                        method="GET", url=req, sort_order=sort + i, created_by=user_id,
                    )
                else:
                    method = req.get("method", "GET")
                    url_obj = req.get("url", {})
                    url = url_obj if isinstance(url_obj, str) else url_obj.get("raw", "")

                    headers = []
                    for h in req.get("header", []):
                        headers.append({
                            "key": h.get("key", ""),
                            "value": h.get("value", ""),
                            "enabled": not h.get("disabled", False),
                            "desc": h.get("description", ""),
                        })

                    params = []
                    if isinstance(url_obj, dict):
                        for q in url_obj.get("query", []):
                            params.append({
                                "key": q.get("key", ""),
                                "value": q.get("value", ""),
                                "enabled": not q.get("disabled", False),
                                "desc": q.get("description", ""),
                            })

                    body = ""
                    body_type = "none"
                    body_obj = req.get("body")
                    if body_obj:
                        mode = body_obj.get("mode", "")
                        if mode == "raw":
                            body = body_obj.get("raw", "")
                            opts = body_obj.get("options", {}).get("raw", {})
                            body_type = "json" if opts.get("language") == "json" else "raw"
                        elif mode == "urlencoded":
                            body_type = "form"
                            body = body_obj.get("urlencoded", [])
                        elif mode == "formdata":
                            body_type = "form-data"
                            body = body_obj.get("formdata", [])

                    auth_data = None
                    auth_obj = req.get("auth")
                    if auth_obj:
                        auth_type = auth_obj.get("type", "")
                        if auth_type == "bearer":
                            tokens = auth_obj.get("bearer", [])
                            token_val = next((t["value"] for t in tokens if t.get("key") == "token"), "")
                            auth_data = {"type": "bearer", "token": token_val}
                        elif auth_type == "basic":
                            basics = auth_obj.get("basic", [])
                            u = next((t["value"] for t in basics if t.get("key") == "username"), "")
                            p = next((t["value"] for t in basics if t.get("key") == "password"), "")
                            auth_data = {"type": "basic", "username": u, "password": p}

                    node = ApiNode(
                        project_id=project_id, parent_id=parent_id,
                        node_type="endpoint", name=item.get("name", "Request"),
                        method=method, url=url, params=params or None,
                        headers=headers or None, body=body if isinstance(body, str) else None,
                        body_type=body_type, auth=auth_data,
                        description=item.get("description", "") or req.get("description", ""),
                        sort_order=sort + i, created_by=user_id,
                    )
                session.add(node)
                count += 1

    info = collection.get("info", {})
    items = collection.get("item", [])
    if items:
        root_name = info.get("name", "Postman Import")
        root = ApiNode(
            project_id=project_id, parent_id=None,
            node_type="folder", name=root_name,
            sort_order=0, created_by=user_id,
        )
        session.add(root)
        await session.flush()
        await session.refresh(root)

        # 递归同步解析（数据量通常不大）
        def _sync_parse(items_list, parent, sort_start=0):
            nonlocal count
            for i, item in enumerate(items_list):
                if "item" in item:
                    folder = ApiNode(
                        project_id=project_id, parent_id=parent,
                        node_type="folder", name=item.get("name", "Folder"),
                        sort_order=sort_start + i, created_by=user_id,
                    )
                    session.add(folder)
                elif "request" in item:
                    req = item["request"]
                    if isinstance(req, str):
                        ep = ApiNode(
                            project_id=project_id, parent_id=parent,
                            node_type="endpoint", name=item.get("name", "Request"),
                            method="GET", url=req,
                            sort_order=sort_start + i, created_by=user_id,
                        )
                        session.add(ep)
                        count += 1
                    else:
                        method = req.get("method", "GET")
                        url_obj = req.get("url", {})
                        raw_url = url_obj if isinstance(url_obj, str) else url_obj.get("raw", "")

                        headers = []
                        for h in req.get("header", []):
                            headers.append({"key": h.get("key", ""), "value": h.get("value", ""),
                                            "enabled": not h.get("disabled", False), "desc": h.get("description", "")})

                        params = []
                        if isinstance(url_obj, dict):
                            for q in url_obj.get("query", []):
                                params.append({"key": q.get("key", ""), "value": q.get("value", ""),
                                               "enabled": not q.get("disabled", False), "desc": q.get("description", "")})

                        body_str = ""
                        bt = "none"
                        body_obj = req.get("body")
                        if body_obj:
                            mode = body_obj.get("mode", "")
                            if mode == "raw":
                                body_str = body_obj.get("raw", "")
                                opts = body_obj.get("options", {}).get("raw", {})
                                bt = "json" if opts.get("language") == "json" else "raw"
                            elif mode == "urlencoded":
                                bt = "form"
                            elif mode == "formdata":
                                bt = "form-data"

                        auth_data = None
                        auth_obj = req.get("auth")
                        if auth_obj:
                            at = auth_obj.get("type", "")
                            if at == "bearer":
                                tokens = auth_obj.get("bearer", [])
                                tv = next((t["value"] for t in tokens if t.get("key") == "token"), "")
                                auth_data = {"type": "bearer", "token": tv}
                            elif at == "basic":
                                basics = auth_obj.get("basic", [])
                                u = next((t["value"] for t in basics if t.get("key") == "username"), "")
                                p = next((t["value"] for t in basics if t.get("key") == "password"), "")
                                auth_data = {"type": "basic", "username": u, "password": p}

                        ep = ApiNode(
                            project_id=project_id, parent_id=parent,
                            node_type="endpoint", name=item.get("name", "Request"),
                            method=method, url=raw_url,
                            params=params or None, headers=headers or None,
                            body=body_str, body_type=bt, auth=auth_data,
                            description=item.get("description", "") or req.get("description", ""),
                            sort_order=sort_start + i, created_by=user_id,
                        )
                        session.add(ep)
                        count += 1

        _sync_parse(items, root.id)
        await session.flush()

    return count


async def batch_sort(session: AsyncSession, items: list[dict]):
    """批量更新排序 [{id, sort_order, parent_id?}]"""
    for item in items:
        await session.execute(
            update(ApiNode)
            .where(ApiNode.id == item["id"])
            .values(
                sort_order=item.get("sort_order", 0),
                **({"parent_id": item["parent_id"]} if "parent_id" in item else {}),
            )
        )
    await session.flush()


def _to_dict(node: ApiNode) -> dict:
    return {
        "id": str(node.id),
        "project_id": str(node.project_id),
        "parent_id": str(node.parent_id) if node.parent_id else None,
        "node_type": node.node_type,
        "name": node.name,
        "sort_order": node.sort_order,
        "method": node.method,
        "url": node.url,
        "params": node.params,
        "headers": node.headers,
        "body": node.body,
        "body_type": node.body_type,
        "auth": node.auth,
        "description": node.description,
        "created_at": node.created_at.isoformat() if node.created_at else None,
        "updated_at": node.updated_at.isoformat() if node.updated_at else None,
    }
