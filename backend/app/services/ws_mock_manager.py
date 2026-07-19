"""WebSocket Mock 服务管理器 — 管理独立端口的 Mock WebSocket 服务"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocket, WebSocketDisconnect

from app.deps.db import async_session_factory
from app.services import ws_mock_service as svc
from app.models.protocol_mock import WsMockEndpoint

logger = logging.getLogger("ws_mock")

_STATE_FILE = Path(__file__).resolve().parent.parent.parent / ".mock_state" / "ws_mock.json"


class WsMockServerManager:
    def __init__(self):
        self.port: int = 28400
        self.host: str = "0.0.0.0"
        self.max_log_count: int = 1000
        self._server = None
        self._app: FastAPI | None = None
        self._task: asyncio.Task | None = None

    def _save_state(self, running: bool):
        try:
            _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            _STATE_FILE.write_text(json.dumps({"running": running, "port": self.port}))
        except Exception:
            pass

    def _load_state(self) -> bool:
        try:
            return json.loads(_STATE_FILE.read_text()).get("running", False)
        except Exception:
            return False

    @property
    def running(self) -> bool:
        if self._server is None:
            return False
        if self._task is not None and self._task.done():
            logger.warning("WebSocket Mock 服务 task 已意外退出，清理状态")
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
        from app.services._mock_server_util import guarded_serve
        task = asyncio.create_task(guarded_serve(server, "WebSocket Mock"))
        self._task = task
        task.add_done_callback(self._on_task_done)
        self._server = server
        for _ in range(50):
            if server.started:
                break
            if task.done():
                self._server = None
                self._task = None
                raise RuntimeError(f"WebSocket Mock 启动失败，端口 {self.port} 可能被占用")
            await asyncio.sleep(0.1)
        logger.info("WebSocket Mock 服务已启动 %s:%d", self.host, self.port)
        self._save_state(True)

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
            logger.info("WebSocket Mock 服务已停止")
            self._save_state(False)

    def _on_task_done(self, task: asyncio.Task) -> None:
        if task.cancelled():
            return
        exc = task.exception()
        if exc:
            logger.error("WebSocket Mock 服务异常退出: %s", exc)
        self._server = None
        self._task = None

    def _create_app(self) -> FastAPI:
        app = FastAPI(title="WebSocket Mock Server")
        app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

        mgr = self

        @app.websocket("/{path:path}")
        async def catch_all(websocket: WebSocket, path: str):
            await mgr._handle_connection(websocket, f"/{path}")

        return app

    async def _handle_connection(self, websocket: WebSocket, path: str) -> None:
        client_ip = websocket.client.host if websocket.client else ""
        endpoint = await self._match_endpoint(path)

        await websocket.accept()

        # Log connect event
        await self._log_event(
            endpoint_id=endpoint.id if endpoint else None,
            event_type="connect",
            path=path,
            client_ip=client_ip,
        )

        try:
            while True:
                message = await websocket.receive_text()

                # Log incoming message
                await self._log_event(
                    endpoint_id=endpoint.id if endpoint else None,
                    event_type="message_in",
                    path=path,
                    client_ip=client_ip,
                    message_type="text",
                    message_preview=message[:2000] if message else None,
                    message_size=len(message) if message else 0,
                    direction="in",
                )

                if endpoint is None:
                    # No matching endpoint — echo by default
                    await websocket.send_text(message)
                    await self._log_event(
                        endpoint_id=None,
                        event_type="message_out",
                        path=path,
                        client_ip=client_ip,
                        message_type="text",
                        message_preview=message[:2000] if message else None,
                        message_size=len(message) if message else 0,
                        direction="out",
                    )
                    continue

                # Apply delay
                if endpoint.delay_ms > 0:
                    await asyncio.sleep(endpoint.delay_ms / 1000.0)

                response_mode = endpoint.response_mode

                if response_mode == "echo":
                    response_text = message
                    await websocket.send_text(response_text)

                elif response_mode == "fixed":
                    response_text = endpoint.fixed_response or ""
                    await websocket.send_text(response_text)

                elif response_mode == "custom":
                    response_text = self._apply_custom_patterns(endpoint, message)
                    await websocket.send_text(response_text)

                elif response_mode == "error":
                    code = endpoint.error_code or 1008
                    reason = endpoint.error_reason or "Server error"
                    await websocket.close(code=code, reason=reason)
                    await self._log_event(
                        endpoint_id=endpoint.id,
                        event_type="disconnect",
                        path=path,
                        client_ip=client_ip,
                    )
                    # Increment hit count
                    await self._increment_hit(endpoint.id)
                    return
                else:
                    # Unknown mode — echo
                    response_text = message
                    await websocket.send_text(response_text)

                # Log outgoing message
                await self._log_event(
                    endpoint_id=endpoint.id,
                    event_type="message_out",
                    path=path,
                    client_ip=client_ip,
                    message_type="text",
                    message_preview=response_text[:2000] if response_text else None,
                    message_size=len(response_text) if response_text else 0,
                    direction="out",
                )

                # Increment hit count
                await self._increment_hit(endpoint.id)

        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("WebSocket Mock 连接处理异常: %s", path)
        finally:
            # Log disconnect event
            await self._log_event(
                endpoint_id=endpoint.id if endpoint else None,
                event_type="disconnect",
                path=path,
                client_ip=client_ip,
            )

    def _apply_custom_patterns(self, endpoint: WsMockEndpoint, message: str) -> str:
        """Check custom_config.patterns for a matching pattern, return matched response or echo."""
        config = endpoint.custom_config or {}
        patterns = config.get("patterns", [])
        for p in patterns:
            pattern = p.get("pattern", "")
            if not pattern:
                continue
            try:
                if re.search(pattern, message):
                    return p.get("response", message)
            except re.error:
                continue
        # No pattern matched — echo
        return message

    async def _match_endpoint(self, path: str) -> WsMockEndpoint | None:
        try:
            async with async_session_factory() as session:
                endpoints = await svc.list_endpoints(session)
                for ep in endpoints:
                    if ep.enabled and ep.path == path:
                        return ep
                # Fallback: prefix match
                for ep in endpoints:
                    if ep.enabled and path.startswith(ep.path):
                        return ep
        except Exception:
            logger.exception("Failed to match WebSocket endpoint for path: %s", path)
        return None

    async def _increment_hit(self, endpoint_id) -> None:
        try:
            async with async_session_factory() as session:
                await svc.increment_hit(session, endpoint_id)
                await session.commit()
        except Exception:
            logger.exception("Failed to increment WebSocket hit count")

    async def _log_event(self, *, endpoint_id, event_type, path, client_ip,
                         message_type=None, message_preview=None,
                         message_size=None, direction=None) -> None:
        log_data = {
            "endpoint_id": endpoint_id,
            "event_type": event_type,
            "path": path,
            "client_ip": client_ip,
            "message_type": message_type,
            "message_preview": message_preview,
            "message_size": message_size,
            "direction": direction,
        }
        try:
            async with async_session_factory() as session:
                await svc.create_log(session, log_data)
                await svc.trim_logs(session, self.max_log_count)
                await session.commit()
        except Exception:
            logger.exception("Failed to save WebSocket mock log")


ws_mock_server = WsMockServerManager()
