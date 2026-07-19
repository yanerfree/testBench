"""gRPC Mock 服务管理器"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from google.protobuf import descriptor_pb2, descriptor_pool, struct_pb2
from google.protobuf.json_format import MessageToJson, Parse
from grpc_reflection.v1alpha import reflection
from grpc_reflection.v1alpha import reflection_pb2, reflection_pb2_grpc

from app.deps.db import async_session_factory
from app.services import grpc_mock_service as svc

logger = logging.getLogger("grpc_mock")

_STATE_FILE = Path(__file__).resolve().parent.parent.parent / ".mock_state" / "grpc_mock.json"

_STRUCT_FQN = "google.protobuf.Struct"


def _build_proto_descriptors(services):
    """Build FileDescriptorProtos that reference google.protobuf.Struct for all methods."""
    grouped = {}
    for s in services:
        if not s.enabled:
            continue
        grouped.setdefault(s.service_name, []).append(s.method_name)

    file_descriptors = []
    for svc_full, methods in grouped.items():
        parts = svc_full.rsplit(".", 1)
        package = parts[0] if len(parts) == 2 else ""
        svc_short = parts[1] if len(parts) == 2 else parts[0]

        fd = descriptor_pb2.FileDescriptorProto()
        fd.name = f"mock_{svc_full}.proto"
        fd.syntax = "proto3"
        if package:
            fd.package = package
        fd.dependency.append("google/protobuf/struct.proto")

        svc_desc = fd.service.add()
        svc_desc.name = svc_short
        for method_name in methods:
            m = svc_desc.method.add()
            m.name = method_name
            m.input_type = f".{_STRUCT_FQN}"
            m.output_type = f".{_STRUCT_FQN}"

        file_descriptors.append(fd)

    return file_descriptors, list(grouped.keys())


class _GenericHandler:
    """Generic gRPC handler that intercepts all RPCs without .proto files."""

    def __init__(self, manager: GrpcMockServerManager):
        self.manager = manager

    def service(self, handler_call_details):
        """Called for every incoming RPC. Returns a handler or None."""
        method = handler_call_details.method
        if not method or not method.startswith("/"):
            return None

        if method.startswith("/grpc.reflection."):
            return None

        # method is like "/package.Service/Method"
        parts = method[1:].rsplit("/", 1)
        if len(parts) != 2:
            return None

        service_name, method_name = parts

        import grpc

        return grpc.unary_unary_rpc_method_handler(
            lambda request, context: self.manager._handle_rpc_sync(
                service_name, method_name, request, context
            ),
        )


class GrpcMockServerManager:
    def __init__(self):
        self.port: int = 28700
        self.host: str = "0.0.0.0"
        self.max_log_count: int = 1000
        self.reflection_version: str = "both"  # both | v1 | v1alpha
        self._server = None
        self._loop: asyncio.AbstractEventLoop | None = None

    # ── 状态持久化 ──

    def _save_state(self, running: bool):
        try:
            _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            _STATE_FILE.write_text(json.dumps({"running": running, "port": self.port, "reflection_version": self.reflection_version}))
        except Exception:
            pass

    def _load_state(self) -> bool:
        try:
            data = json.loads(_STATE_FILE.read_text())
            self.reflection_version = data.get("reflection_version", "both")
            self.port = data.get("port", self.port)
            return data.get("running", False)
        except Exception:
            return False

    # ── 服务管理 ──

    @property
    def running(self) -> bool:
        return self._server is not None

    async def start(self):
        if self.running:
            return
        import grpc

        self._loop = asyncio.get_event_loop()
        self._server = grpc.server(
            ThreadPoolExecutor(max_workers=10),
        )
        self._server.add_generic_rpc_handlers([_GenericHandler(self)])

        service_names = await self._register_reflection()

        bound = self._server.add_insecure_port(f"[::]:{self.port}")
        if bound == 0:
            self._server = None
            raise RuntimeError(f"gRPC Mock 启动失败，端口 {self.port} 可能被占用")
        self._server.start()
        logger.info("gRPC Mock 服务已启动 [::]:%d (reflection: %d services)", self.port, len(service_names))
        self._save_state(True)

    async def _register_reflection(self) -> list[str]:
        """Register gRPC reflection with dynamically built descriptors from DB services.

        根据 self.reflection_version 注册 v1alpha / v1 / 两者。
        v1 与 v1alpha 反射协议的 wire 格式完全一致，只是服务名不同，因此可共享同一 servicer。
        """
        try:
            async with async_session_factory() as session:
                services = await svc.list_services(session)

            file_descriptors, service_names = _build_proto_descriptors(services)

            pool = None
            if file_descriptors:
                pool = descriptor_pool.DescriptorPool()
                struct_fd = descriptor_pb2.FileDescriptorProto()
                struct_pb2.DESCRIPTOR.CopyToProto(struct_fd)
                try:
                    pool.Add(struct_fd)
                except Exception:
                    pass
                for fd in file_descriptors:
                    try:
                        pool.Add(fd)
                    except Exception:
                        pass

            self._enable_reflection(service_names, pool)
            return service_names
        except Exception as e:
            logger.warning("Failed to register reflection: %s", e)
            return []

    def _enable_reflection(self, service_names: list[str], pool) -> None:
        """按 reflection_version 注册反射服务。"""
        version = self.reflection_version or "both"
        servicer = reflection.ReflectionServicer(service_names, pool=pool)

        # v1alpha —— 标准注册
        if version in ("both", "v1alpha"):
            reflection_pb2_grpc.add_ServerReflectionServicer_to_server(servicer, self._server)

        # v1 —— 用同一 servicer 注册到 v1 服务名下（wire 兼容）
        if version in ("both", "v1"):
            import grpc
            handlers = {
                "ServerReflectionInfo": grpc.stream_stream_rpc_method_handler(
                    servicer.ServerReflectionInfo,
                    request_deserializer=reflection_pb2.ServerReflectionRequest.FromString,
                    response_serializer=reflection_pb2.ServerReflectionResponse.SerializeToString,
                ),
            }
            generic_handler = grpc.method_handlers_generic_handler(
                "grpc.reflection.v1.ServerReflection", handlers
            )
            self._server.add_generic_rpc_handlers((generic_handler,))

    async def refresh_reflection(self):
        """Re-register reflection after service changes (add/delete/toggle)."""
        if not self.running:
            return
        await self._register_reflection()

    async def stop(self):
        if self._server:
            event = self._server.stop(grace=5)
            # Wait for graceful shutdown in a thread to avoid blocking the event loop
            await asyncio.get_event_loop().run_in_executor(None, event.wait, 10)
            self._server = None
            self._loop = None
            logger.info("gRPC Mock 服务已停止")
            self._save_state(False)

    # ── RPC 处理（同步，在 gRPC 线程池中执行） ──

    def _handle_rpc_sync(self, service_name: str, method_name: str, request_bytes: bytes, context):
        """Synchronous handler called from gRPC thread pool."""
        import grpc as _grpc

        t0 = time.perf_counter()

        # Decode request: try protobuf Struct first, fall back to raw UTF-8
        try:
            req_struct = struct_pb2.Struct()
            req_struct.ParseFromString(request_bytes)
            request_text = MessageToJson(req_struct, preserving_proto_field_name=True)
        except Exception:
            try:
                request_text = request_bytes.decode("utf-8") if request_bytes else ""
            except Exception:
                request_text = request_bytes.hex() if request_bytes else ""

        # Find matching service in DB via the async event loop
        if self._loop is None or self._loop.is_closed():
            context.abort(_grpc.StatusCode.UNAVAILABLE, "Server shutting down")
            return b""

        try:
            future = asyncio.run_coroutine_threadsafe(
                self._find_and_respond(service_name, method_name, request_text, t0, context),
                self._loop,
            )
            result = future.result(timeout=30)
        except Exception as e:
            logger.exception("gRPC handler error: %s/%s", service_name, method_name)
            context.abort(_grpc.StatusCode.INTERNAL, str(e))
            return b""

        if result is None:
            context.abort(
                _grpc.StatusCode.NOT_FOUND,
                f"No mock for {service_name}/{method_name}",
            )
            return b""

        status_code, response_bytes, status_message = result
        if status_code != 0:
            grpc_code = self._map_status_code(status_code)
            context.abort(grpc_code, status_message or "Mock error")
            return b""

        return response_bytes

    @staticmethod
    def _map_status_code(code: int):
        """Map integer gRPC status codes to grpc.StatusCode enum values."""
        import grpc as _grpc

        code_map = {
            1: _grpc.StatusCode.CANCELLED,
            2: _grpc.StatusCode.UNKNOWN,
            3: _grpc.StatusCode.INVALID_ARGUMENT,
            4: _grpc.StatusCode.DEADLINE_EXCEEDED,
            5: _grpc.StatusCode.NOT_FOUND,
            6: _grpc.StatusCode.ALREADY_EXISTS,
            7: _grpc.StatusCode.PERMISSION_DENIED,
            8: _grpc.StatusCode.RESOURCE_EXHAUSTED,
            9: _grpc.StatusCode.FAILED_PRECONDITION,
            10: _grpc.StatusCode.ABORTED,
            11: _grpc.StatusCode.OUT_OF_RANGE,
            12: _grpc.StatusCode.UNIMPLEMENTED,
            13: _grpc.StatusCode.INTERNAL,
            14: _grpc.StatusCode.UNAVAILABLE,
            15: _grpc.StatusCode.DATA_LOSS,
            16: _grpc.StatusCode.UNAUTHENTICATED,
        }
        return code_map.get(code, _grpc.StatusCode.UNKNOWN)

    async def _find_and_respond(
        self,
        service_name: str,
        method_name: str,
        request_text: str,
        t0: float,
        context,
    ) -> tuple[int, bytes, str | None] | None:
        """Async DB lookup, response building, and logging."""
        async with async_session_factory() as session:
            services = await svc.list_services(session)
            matched = None
            for s in services:
                if s.enabled and s.service_name == service_name and s.method_name == method_name:
                    matched = s
                    break

            if not matched:
                # Log unmatched call
                try:
                    await svc.create_log(session, {
                        "service_id": None,
                        "service_name": service_name,
                        "method_name": method_name,
                        "method_type": "unary",
                        "request_body": request_text[:10000],
                        "response_body": None,
                        "status_code": 5,  # NOT_FOUND
                        "duration_ms": round((time.perf_counter() - t0) * 1000, 2),
                    })
                    await session.commit()
                except Exception:
                    logger.exception("Failed to log unmatched gRPC call")
                return None

            # Apply delay
            if matched.delay_ms > 0:
                await asyncio.sleep(matched.delay_ms / 1000.0)

            response_text = matched.response_body or "{}"
            # Encode response as protobuf Struct for grpcurl compatibility
            try:
                resp_data = json.loads(response_text)
                resp_struct = struct_pb2.Struct()
                resp_struct.update(resp_data if isinstance(resp_data, dict) else {"value": resp_data})
                response_bytes = resp_struct.SerializeToString()
            except (json.JSONDecodeError, Exception):
                response_bytes = response_text.encode("utf-8")

            duration_ms = (time.perf_counter() - t0) * 1000

            # Log matched call
            try:
                await svc.create_log(session, {
                    "service_id": matched.id,
                    "service_name": service_name,
                    "method_name": method_name,
                    "method_type": matched.method_type,
                    "request_body": request_text[:10000],
                    "response_body": response_text[:10000],
                    "status_code": matched.status_code,
                    "duration_ms": round(duration_ms, 2),
                })
                await svc.increment_hit(session, matched.id)
                await svc.trim_logs(session, self.max_log_count)
                await session.commit()
            except Exception:
                logger.exception("Failed to save gRPC mock log")

            return (matched.status_code, response_bytes, matched.status_message)


grpc_mock_server = GrpcMockServerManager()
