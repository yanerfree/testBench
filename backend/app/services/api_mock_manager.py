"""API Mock 服务管理器 — 管理独立端口的通用 Mock HTTP 服务"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.cors import CORSMiddleware

from app.deps.db import async_session_factory
from app.services import api_mock_engine as engine
from app.services import api_mock_service as svc

logger = logging.getLogger("api_mock")


class ApiMockServerManager:
    def __init__(self):
        self.port: int = 9200
        self.host: str = "0.0.0.0"
        self.capture_enabled: bool = True
        self.max_log_count: int = 1000
        self._server = None
        self._app: FastAPI | None = None
        self._task: asyncio.Task | None = None

    @property
    def running(self) -> bool:
        if self._server is None:
            return False
        if self._task is not None and self._task.done():
            logger.warning("API Mock 服务 task 已意外退出，清理状态")
            self._server = None
            self._task = None
            return False
        return getattr(self._server, 'started', False)

    async def start(self) -> None:
        if self.running:
            return
        self._app = self._create_app()
        import uvicorn
        config = uvicorn.Config(self._app, host=self.host, port=self.port, log_level="warning")
        server = uvicorn.Server(config)
        self._task = asyncio.create_task(server.serve())
        self._task.add_done_callback(self._on_task_done)
        self._server = server
        for _ in range(50):
            if server.started:
                break
            await asyncio.sleep(0.1)
        logger.info("API Mock 服务已启动 %s:%d", self.host, self.port)

    async def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
            if self._task:
                try:
                    await asyncio.wait_for(self._task, timeout=5)
                except (asyncio.TimeoutError, Exception):
                    pass
            self._server = None
            self._task = None
            logger.info("API Mock 服务已停止")

    def _on_task_done(self, task: asyncio.Task) -> None:
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            logger.error("API Mock 服务异常退出: %s", exc)
        self._server = None
        self._task = None

    def _create_app(self) -> FastAPI:
        app = FastAPI(title="API Mock Server")
        app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

        mgr = self

        @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
        async def catch_all(request: Request, path: str):
            return await mgr._handle_request(request, f"/{path}")

        return app

    async def _handle_request(self, request: Request, path: str) -> Response:
        try:
            return await self._do_handle_request(request, path)
        except Exception:
            logger.exception("API Mock 请求处理异常: %s %s", request.method, path)
            return JSONResponse(
                {"error": "Internal mock server error"},
                status_code=500,
            )

    async def _do_handle_request(self, request: Request, path: str) -> Response:
        t0 = time.perf_counter()
        method = request.method

        body_bytes = await request.body()
        request_body_str = body_bytes.decode("utf-8", errors="replace") if body_bytes else None

        t_match_start = time.perf_counter()
        matched_route = await self._match_route(method, path)
        match_ms = (time.perf_counter() - t_match_start) * 1000

        if matched_route is None:
            return JSONResponse(
                {"error": "Not Found", "message": f"No mock route matched for {method} {path}"},
                status_code=404,
            )

        route_dict = self._route_to_dict(matched_route)

        # 延迟模拟
        delay = route_dict.get("delay_ms", 0)
        if delay > 0:
            await asyncio.sleep(delay / 1000.0)

        # 代理模式
        proxy_url = route_dict.get("proxy_url")
        if proxy_url:
            resp_body, resp_status, resp_ct, resp_headers = await self._proxy_request(
                proxy_url, method, path, request, body_bytes, route_dict
            )
        else:
            resp_body, resp_ct = engine.resolve_body(route_dict, request_body_str, method, path)
            resp_status = route_dict["status_code"]
            resp_headers = engine.build_headers(route_dict)

        t_done = time.perf_counter()
        total_ms = (t_done - t0) * 1000

        if self.capture_enabled:
            await self._log_request(
                route_dict, request, request_body_str, method, path,
                resp_status, resp_ct, resp_body, resp_headers,
                match_ms, total_ms,
            )

        if resp_status == 204:
            return Response(status_code=204, headers=resp_headers)

        return Response(
            content=resp_body,
            status_code=resp_status,
            media_type=resp_ct,
            headers=resp_headers,
        )

    async def _proxy_request(
        self, proxy_url: str, method: str, path: str,
        request: Request, body_bytes: bytes, route_dict: dict,
    ) -> tuple[str, int, str, dict]:
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.request(method, proxy_url, content=body_bytes, headers=headers)
                resp_body = resp.text
                resp_status = resp.status_code
                resp_ct = resp.headers.get("content-type", "application/octet-stream")
                resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-length", "transfer-encoding", "content-encoding")}

                if route_dict.get("proxy_modify_response"):
                    resp_body = route_dict.get("response_body", resp_body)
                    resp_status = route_dict.get("status_code", resp_status)
                    resp_ct = route_dict.get("content_type", resp_ct)

                return resp_body, resp_status, resp_ct, resp_headers
        except Exception as e:
            logger.warning("Proxy request failed: %s", str(e))
            return json.dumps({"error": "Proxy Error", "message": str(e)}), 502, "application/json", {}

    async def _match_route(self, method: str, path: str):
        async with async_session_factory() as session:
            routes = await svc.list_routes(session)
            enabled = [r for r in routes if r.enabled and r.method.upper() == method.upper()]

            # 1. 精确匹配
            for r in enabled:
                if r.match_mode == "exact" and r.path == path:
                    await svc.increment_hit(session, r.id)
                    await session.commit()
                    return r

            # 2. 前缀匹配（长路径优先）
            prefix_routes = [r for r in enabled if r.match_mode == "prefix"]
            prefix_routes.sort(key=lambda r: len(r.path), reverse=True)
            for r in prefix_routes:
                if r.path == "/" or path.startswith(r.path):
                    await svc.increment_hit(session, r.id)
                    await session.commit()
                    return r

            # 3. 正则匹配
            for r in enabled:
                if r.match_mode == "regex":
                    try:
                        if re.fullmatch(r.path, path):
                            await svc.increment_hit(session, r.id)
                            await session.commit()
                            return r
                    except re.error:
                        continue

            # 4. 兜底：exact 模式也尝试后缀匹配
            for r in enabled:
                if r.match_mode == "exact" and r.path != "/" and path.endswith(r.path):
                    await svc.increment_hit(session, r.id)
                    await session.commit()
                    return r

        return None

    def _route_to_dict(self, route) -> dict:
        return {
            "id": route.id,
            "name": route.name,
            "method": route.method,
            "path": route.path,
            "delay_ms": route.delay_ms,
            "status_code": route.status_code,
            "content_type": route.content_type,
            "response_body": route.response_body,
            "response_headers": route.response_headers,
            "response_mode": route.response_mode,
            "match_mode": route.match_mode,
            "proxy_url": route.proxy_url,
            "proxy_modify_response": route.proxy_modify_response,
        }

    async def _log_request(
        self, route_dict, request, request_body_str, method, path,
        status_code, content_type, response_body_str, resp_headers,
        match_ms, total_ms,
    ):
        req_headers = dict(request.headers) if request else {}
        caller = req_headers.get("user-agent", "")
        ip = request.client.host if request and request.client else ""

        log_data = {
            "route_id": route_dict.get("id"),
            "method": method,
            "path": path,
            "request_headers": req_headers,
            "request_body": request_body_str[:10000] if request_body_str else None,
            "caller": caller[:500] if caller else None,
            "ip": ip,
            "status_code": status_code,
            "content_type": content_type,
            "response_body": response_body_str[:10000] if response_body_str else None,
            "response_headers_out": resp_headers if isinstance(resp_headers, dict) else None,
            "match_ms": round(match_ms, 2),
            "total_ms": round(total_ms, 2),
        }
        try:
            async with async_session_factory() as session:
                await svc.create_log(session, log_data)
                await svc.trim_logs(session, self.max_log_count)
                await session.commit()
        except Exception:
            logger.exception("Failed to save API mock request log")


api_mock_server = ApiMockServerManager()
