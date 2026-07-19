"""UDP Mock 服务管理器"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from pathlib import Path

from app.deps.db import async_session_factory
from app.services import udp_mock_service as svc

logger = logging.getLogger("udp_mock")

_STATE_FILE = Path(__file__).resolve().parent.parent.parent / ".mock_state" / "udp_mock.json"


class _UdpProtocol(asyncio.DatagramProtocol):
    """asyncio datagram protocol that delegates to the manager."""

    def __init__(self, manager: UdpMockServerManager):
        self.manager = manager
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data: bytes, addr: tuple):
        asyncio.ensure_future(self.manager._handle_datagram(data, addr, self.transport))

    def error_received(self, exc: Exception):
        logger.warning("UDP protocol error: %s", exc)

    def connection_lost(self, exc):
        if exc:
            logger.warning("UDP connection lost: %s", exc)


class UdpMockServerManager:
    def __init__(self):
        self.port: int = 28600
        self.host: str = "0.0.0.0"
        self.max_log_count: int = 1000
        self._transport = None
        self._protocol = None

    # ── 状态持久化 ──

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

    # ── 服务管理 ──

    @property
    def running(self) -> bool:
        return self._transport is not None

    async def start(self):
        if self.running:
            return
        loop = asyncio.get_event_loop()
        self._transport, self._protocol = await loop.create_datagram_endpoint(
            lambda: _UdpProtocol(self),
            local_addr=(self.host, self.port),
        )
        logger.info("UDP Mock 服务已启动 %s:%d", self.host, self.port)
        self._save_state(True)

    async def stop(self):
        if self._transport:
            self._transport.close()
            self._transport = None
            self._protocol = None
            logger.info("UDP Mock 服务已停止")
            self._save_state(False)

    # ── 数据报处理 ──

    async def _handle_datagram(self, data: bytes, addr: tuple, transport):
        try:
            await self._do_handle_datagram(data, addr, transport)
        except Exception:
            logger.exception("UDP Mock 处理异常, client=%s:%s", addr[0], addr[1])

    async def _do_handle_datagram(self, data: bytes, addr: tuple, transport):
        t0 = time.perf_counter()
        client_ip, client_port = addr[0], addr[1]
        data_size = len(data)

        # Decode incoming data for text matching
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = None
        hex_str = data.hex()

        # Log incoming datagram
        await self._log_event(
            handler_id=None,
            client_ip=client_ip,
            client_port=client_port,
            direction="in",
            data_preview=(text or hex_str)[:2000],
            data_size=data_size,
        )

        # Find matching handler
        async with async_session_factory() as session:
            handlers = await svc.list_handlers(session)
            matched = None
            for h in handlers:
                if not h.enabled:
                    continue
                if self._matches(h, text, hex_str):
                    matched = h
                    break

            if matched is None:
                return

            # Apply delay
            if matched.delay_ms > 0:
                await asyncio.sleep(matched.delay_ms / 1000.0)

            # Build response
            response_bytes = self._build_response(matched, data)

            if response_bytes is not None:
                transport.sendto(response_bytes, addr)

                # Log outgoing datagram
                try:
                    out_text = response_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    out_text = response_bytes.hex()

                await self._log_event(
                    handler_id=matched.id,
                    client_ip=client_ip,
                    client_port=client_port,
                    direction="out",
                    data_preview=out_text[:2000],
                    data_size=len(response_bytes),
                )

            # Increment hit counter
            await svc.increment_hit(session, matched.id)
            await session.commit()

    @staticmethod
    def _matches(handler, text: str | None, hex_str: str) -> bool:
        """Check if incoming data matches a handler's pattern."""
        mode = handler.match_mode
        pattern = handler.match_pattern

        if mode == "exact":
            if text is not None and text.strip() == pattern.strip():
                return True
            return False

        if mode == "hex":
            return hex_str.lower() == pattern.lower().replace(" ", "")

        if mode == "regex":
            if text is None:
                return False
            try:
                return bool(re.search(pattern, text))
            except re.error:
                logger.warning("Invalid regex pattern in handler %s: %s", handler.name, pattern)
                return False

        return False

    @staticmethod
    def _build_response(handler, original_data: bytes) -> bytes | None:
        """Build response bytes based on handler's response_mode."""
        mode = handler.response_mode

        if mode == "echo":
            return original_data

        if mode in ("fixed", "custom"):
            response_data = handler.response_data
            if not response_data:
                return None
            if handler.response_hex:
                try:
                    return bytes.fromhex(response_data.replace(" ", ""))
                except ValueError:
                    logger.warning("Invalid hex response in handler %s", handler.name)
                    return None
            return response_data.encode("utf-8")

        return None

    async def _log_event(
        self,
        *,
        handler_id,
        client_ip: str,
        client_port: int,
        direction: str,
        data_preview: str,
        data_size: int,
    ):
        """Persist a datagram log entry."""
        try:
            async with async_session_factory() as session:
                await svc.create_log(session, {
                    "handler_id": handler_id,
                    "client_ip": client_ip,
                    "client_port": client_port,
                    "direction": direction,
                    "data_preview": data_preview,
                    "data_size": data_size,
                })
                await svc.trim_logs(session, self.max_log_count)
                await session.commit()
        except Exception:
            logger.exception("Failed to save UDP mock log")


udp_mock_server = UdpMockServerManager()
