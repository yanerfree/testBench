"""协议 Mock 预制模板 — WebSocket / TCP / UDP / gRPC"""
from __future__ import annotations

import json


# ═══════════════════════════════════════════════
#  WebSocket 预设
# ═══════════════════════════════════════════════

WS_PRESETS: dict[str, dict] = {
    "ws_echo": {
        "label": "Echo 服务",
        "group": "基础",
        "name": "Echo 服务",
        "path": "/ws",
        "response_mode": "echo",
        "description": "原样返回收到的消息",
    },
    "ws_chat": {
        "label": "聊天室模拟",
        "group": "基础",
        "name": "聊天室",
        "path": "/ws/chat",
        "response_mode": "fixed",
        "fixed_response": json.dumps({"type": "message", "from": "server", "content": "收到你的消息", "timestamp": "2026-01-01T00:00:00Z"}, ensure_ascii=False),
        "description": "返回固定的聊天消息格式",
    },
    "ws_notify": {
        "label": "消息推送",
        "group": "基础",
        "name": "推送通知",
        "path": "/ws/notify",
        "response_mode": "fixed",
        "fixed_response": json.dumps({"event": "notification", "data": {"title": "系统通知", "body": "您有一条新消息", "level": "info"}}, ensure_ascii=False),
        "description": "模拟 WebSocket 推送通知",
    },
    "ws_heartbeat": {
        "label": "心跳检测",
        "group": "协议",
        "name": "心跳服务",
        "path": "/ws/heartbeat",
        "response_mode": "custom",
        "custom_config": {"patterns": [
            {"match": "ping", "response": "pong"},
            {"match": ".*", "response": json.dumps({"type": "heartbeat", "status": "alive"}, ensure_ascii=False)},
        ]},
        "description": "ping 返回 pong，其他返回心跳状态",
    },
    "ws_json_api": {
        "label": "JSON 消息接口",
        "group": "协议",
        "name": "JSON API",
        "path": "/ws/api",
        "response_mode": "custom",
        "custom_config": {"patterns": [
            {"match": "\"action\":\\s*\"subscribe\"", "response": json.dumps({"status": "subscribed", "channel": "default"}, ensure_ascii=False)},
            {"match": "\"action\":\\s*\"unsubscribe\"", "response": json.dumps({"status": "unsubscribed"}, ensure_ascii=False)},
            {"match": ".*", "response": json.dumps({"status": "ok", "echo": True}, ensure_ascii=False)},
        ]},
        "description": "模拟基于 JSON 的 WebSocket API",
    },
    "ws_error": {
        "label": "错误关闭",
        "group": "异常",
        "name": "错误模拟",
        "path": "/ws/error",
        "response_mode": "error",
        "error_code": 1008,
        "error_reason": "Policy Violation",
        "description": "连接后立即返回错误关闭",
    },
}


# ═══════════════════════════════════════════════
#  TCP 预设
# ═══════════════════════════════════════════════

TCP_PRESETS: dict[str, dict] = {
    "tcp_echo": {
        "label": "Echo 服务",
        "group": "基础",
        "name": "Echo",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "echo",
        "description": "原样返回所有收到的数据",
    },
    "tcp_ping_pong": {
        "label": "Ping / Pong",
        "group": "基础",
        "name": "Ping Pong",
        "match_mode": "exact",
        "match_pattern": "ping",
        "response_mode": "fixed",
        "response_data": "pong",
        "description": "收到 ping 返回 pong",
    },
    "tcp_http_200": {
        "label": "HTTP 200 响应",
        "group": "协议模拟",
        "name": "HTTP 200",
        "match_mode": "regex",
        "match_pattern": "^(GET|POST|PUT|DELETE|HEAD)\\s",
        "response_mode": "fixed",
        "response_data": "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK",
        "description": "收到 HTTP 请求返回 200 OK",
    },
    "tcp_redis_ok": {
        "label": "Redis PING",
        "group": "协议模拟",
        "name": "Redis Mock",
        "match_mode": "regex",
        "match_pattern": "(?i)^\\*?\\d*.*PING",
        "response_mode": "fixed",
        "response_data": "+PONG\r\n",
        "description": "模拟 Redis PING 命令响应",
    },
    "tcp_mysql_handshake": {
        "label": "MySQL 握手",
        "group": "协议模拟",
        "name": "MySQL Handshake",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "fixed",
        "response_data": "ERR: Mock MySQL - Connection not supported",
        "description": "模拟 MySQL 握手拒绝",
    },
    "tcp_json_request": {
        "label": "JSON 请求响应",
        "group": "数据格式",
        "name": "JSON 处理",
        "match_mode": "regex",
        "match_pattern": "^\\{.*\\}$",
        "response_mode": "fixed",
        "response_data": json.dumps({"code": 0, "message": "success", "data": None}, ensure_ascii=False),
        "description": "收到 JSON 格式的数据返回标准 JSON 响应",
    },
    "tcp_close": {
        "label": "立即关闭",
        "group": "异常",
        "name": "拒绝连接",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "close",
        "description": "收到任何数据后立即关闭连接",
    },
    "tcp_hex_response": {
        "label": "Hex 二进制响应",
        "group": "数据格式",
        "name": "二进制响应",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "fixed",
        "response_data": "48656c6c6f",
        "response_hex": True,
        "description": "返回十六进制编码的 Hello (48656c6c6f)",
    },
}


# ═══════════════════════════════════════════════
#  UDP 预设
# ═══════════════════════════════════════════════

UDP_PRESETS: dict[str, dict] = {
    "udp_echo": {
        "label": "Echo 服务",
        "group": "基础",
        "name": "Echo",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "echo",
        "description": "原样返回所有收到的数据报",
    },
    "udp_dns_mock": {
        "label": "DNS 模拟",
        "group": "协议模拟",
        "name": "DNS Mock",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "fixed",
        "response_data": json.dumps({"ip": "127.0.0.1", "ttl": 300}, ensure_ascii=False),
        "description": "模拟 DNS 响应返回 127.0.0.1",
    },
    "udp_syslog": {
        "label": "Syslog 接收",
        "group": "协议模拟",
        "name": "Syslog Receiver",
        "match_mode": "regex",
        "match_pattern": "^<\\d+>",
        "response_mode": "fixed",
        "response_data": "ACK",
        "description": "匹配 Syslog 格式消息，返回 ACK",
    },
    "udp_ntp_mock": {
        "label": "NTP 模拟",
        "group": "协议模拟",
        "name": "NTP Mock",
        "match_mode": "regex",
        "match_pattern": ".*",
        "response_mode": "fixed",
        "response_data": json.dumps({"timestamp": 1720000000, "stratum": 2, "precision": -20}, ensure_ascii=False),
        "description": "模拟 NTP 时间响应（JSON 格式）",
    },
    "udp_health_check": {
        "label": "健康检查",
        "group": "基础",
        "name": "Health Check",
        "match_mode": "exact",
        "match_pattern": "health",
        "response_mode": "fixed",
        "response_data": "OK",
        "description": "收到 health 返回 OK",
    },
    "udp_json_response": {
        "label": "JSON 数据报",
        "group": "数据格式",
        "name": "JSON 响应",
        "match_mode": "regex",
        "match_pattern": "^\\{",
        "response_mode": "fixed",
        "response_data": json.dumps({"status": "received", "code": 0}, ensure_ascii=False),
        "description": "收到 JSON 数据报返回确认",
    },
}


# ═══════════════════════════════════════════════
#  gRPC 预设
# ═══════════════════════════════════════════════

GRPC_PRESETS: dict[str, dict] = {
    "grpc_hello": {
        "label": "Greeter / SayHello",
        "group": "Unary",
        "name": "Hello World",
        "service_name": "helloworld.Greeter",
        "method_name": "SayHello",
        "method_type": "unary",
        "request_sample": json.dumps({"name": "World"}, ensure_ascii=False, indent=2),
        "response_body": json.dumps({"message": "Hello, World!"}, ensure_ascii=False, indent=2),
        "description": "经典 gRPC Hello World 示例",
    },
    "grpc_user_get": {
        "label": "获取用户",
        "group": "Unary",
        "name": "GetUser",
        "service_name": "user.UserService",
        "method_name": "GetUser",
        "method_type": "unary",
        "request_sample": json.dumps({"user_id": "12345"}, ensure_ascii=False, indent=2),
        "response_body": json.dumps({"user_id": "12345", "name": "张三", "email": "zhangsan@example.com", "role": "admin", "created_at": "2026-01-15T10:30:00Z"}, ensure_ascii=False, indent=2),
        "description": "模拟用户服务的获取用户详情",
    },
    "grpc_user_list": {
        "label": "用户列表 (Stream)",
        "group": "Stream",
        "name": "ListUsers",
        "service_name": "user.UserService",
        "method_name": "ListUsers",
        "method_type": "server_stream",
        "request_sample": json.dumps({"page": 1, "page_size": 10}, ensure_ascii=False, indent=2),
        "response_body": json.dumps({"user_id": "1", "name": "用户A"}, ensure_ascii=False, indent=2),
        "stream_items": [
            {"user_id": "1", "name": "用户 A", "role": "admin"},
            {"user_id": "2", "name": "用户 B", "role": "user"},
            {"user_id": "3", "name": "用户 C", "role": "viewer"},
        ],
        "description": "Server streaming 示例 — 逐个返回多个用户",
    },
    "grpc_health": {
        "label": "健康检查",
        "group": "Unary",
        "name": "Health Check",
        "service_name": "grpc.health.v1.Health",
        "method_name": "Check",
        "method_type": "unary",
        "request_sample": json.dumps({"service": ""}, ensure_ascii=False, indent=2),
        "response_body": json.dumps({"status": "SERVING"}, ensure_ascii=False, indent=2),
        "description": "gRPC 标准健康检查协议",
    },
    "grpc_not_found": {
        "label": "资源未找到",
        "group": "错误码",
        "name": "NotFound Error",
        "service_name": "example.Service",
        "method_name": "GetResource",
        "method_type": "unary",
        "response_body": "{}",
        "status_code": 5,
        "status_message": "Resource not found",
        "description": "返回 NOT_FOUND (5) 错误状态",
    },
    "grpc_invalid_arg": {
        "label": "参数错误",
        "group": "错误码",
        "name": "InvalidArgument Error",
        "service_name": "example.Service",
        "method_name": "CreateResource",
        "method_type": "unary",
        "response_body": "{}",
        "status_code": 3,
        "status_message": "Invalid argument: name is required",
        "description": "返回 INVALID_ARGUMENT (3) 错误状态",
    },
    "grpc_order_create": {
        "label": "创建订单",
        "group": "Unary",
        "name": "CreateOrder",
        "service_name": "order.OrderService",
        "method_name": "CreateOrder",
        "method_type": "unary",
        "request_sample": json.dumps({"items": [{"product_id": "P001", "quantity": 2}], "user_id": "U123"}, ensure_ascii=False, indent=2),
        "response_body": json.dumps({"order_id": "ORD-20260715-001", "status": "CREATED", "total_amount": 199.00, "created_at": "2026-07-15T12:00:00Z"}, ensure_ascii=False, indent=2),
        "description": "模拟订单服务创建订单",
    },
}


# ─── 公共接口 ───

def list_ws_presets() -> list[dict]:
    return [{"key": k, **v} for k, v in WS_PRESETS.items()]

def list_tcp_presets() -> list[dict]:
    return [{"key": k, **v} for k, v in TCP_PRESETS.items()]

def list_udp_presets() -> list[dict]:
    return [{"key": k, **v} for k, v in UDP_PRESETS.items()]

def list_grpc_presets() -> list[dict]:
    return [{"key": k, **v} for k, v in GRPC_PRESETS.items()]

def get_ws_preset(key: str) -> dict | None:
    return WS_PRESETS.get(key)

def get_tcp_preset(key: str) -> dict | None:
    return TCP_PRESETS.get(key)

def get_udp_preset(key: str) -> dict | None:
    return UDP_PRESETS.get(key)

def get_grpc_preset(key: str) -> dict | None:
    return GRPC_PRESETS.get(key)
