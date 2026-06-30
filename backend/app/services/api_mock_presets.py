"""API Mock 预制响应模板"""
from __future__ import annotations

import json

PRESETS: dict[str, dict] = {
    # ── JSON 响应 ──
    "json_success": {
        "label": "JSON 成功响应",
        "group": "json",
        "status_code": 200,
        "content_type": "application/json",
        "response_body": json.dumps({"code": 0, "message": "success", "data": {"id": 1, "name": "test", "status": "active"}}, ensure_ascii=False, indent=2),
    },
    "json_list": {
        "label": "JSON 列表分页",
        "group": "json",
        "status_code": 200,
        "content_type": "application/json",
        "response_body": json.dumps({
            "code": 0, "message": "success",
            "data": {
                "list": [
                    {"id": 1, "name": "项目 A", "status": "active", "createdAt": "2026-01-15T10:30:00Z"},
                    {"id": 2, "name": "项目 B", "status": "inactive", "createdAt": "2026-02-20T14:00:00Z"},
                    {"id": 3, "name": "项目 C", "status": "active", "createdAt": "2026-03-10T09:15:00Z"},
                ],
                "total": 100, "page": 1, "pageSize": 20,
            }
        }, ensure_ascii=False, indent=2),
    },
    "json_empty": {
        "label": "JSON 空数据",
        "group": "json",
        "status_code": 200,
        "content_type": "application/json",
        "response_body": json.dumps({"code": 0, "message": "success", "data": None}, ensure_ascii=False, indent=2),
    },
    "json_created": {
        "label": "JSON 创建成功",
        "group": "json",
        "status_code": 201,
        "content_type": "application/json",
        "response_body": json.dumps({"code": 0, "message": "创建成功", "data": {"id": 42, "createdAt": "2026-06-18T12:00:00Z"}}, ensure_ascii=False, indent=2),
    },
    "json_error": {
        "label": "JSON 服务端错误",
        "group": "json",
        "status_code": 500,
        "content_type": "application/json",
        "response_body": json.dumps({"code": 500, "message": "Internal Server Error", "data": None}, ensure_ascii=False, indent=2),
    },
    "json_auth_fail": {
        "label": "JSON 认证失败",
        "group": "json",
        "status_code": 401,
        "content_type": "application/json",
        "response_body": json.dumps({"code": 401, "message": "Token expired or invalid", "data": None}, ensure_ascii=False, indent=2),
    },
    "json_validation": {
        "label": "JSON 参数校验失败",
        "group": "json",
        "status_code": 422,
        "content_type": "application/json",
        "response_body": json.dumps({
            "code": 422, "message": "参数校验失败",
            "errors": [
                {"field": "email", "message": "邮箱格式不正确"},
                {"field": "phone", "message": "手机号不能为空"},
            ]
        }, ensure_ascii=False, indent=2),
    },
    "json_forbidden": {
        "label": "JSON 权限不足",
        "group": "json",
        "status_code": 403,
        "content_type": "application/json",
        "response_body": json.dumps({"code": 403, "message": "权限不足，请联系管理员", "data": None}, ensure_ascii=False, indent=2),
    },

    # ── XML 响应 ──
    "xml_success": {
        "label": "XML 成功响应",
        "group": "xml",
        "status_code": 200,
        "content_type": "text/xml",
        "response_body": '<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  <code>0</code>\n  <message>success</message>\n  <data>\n    <id>1</id>\n    <name>test</name>\n    <status>active</status>\n  </data>\n</response>',
    },
    "xml_soap": {
        "label": "SOAP 响应",
        "group": "xml",
        "status_code": 200,
        "content_type": "text/xml",
        "response_body": '<?xml version="1.0" encoding="UTF-8"?>\n<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">\n  <soap:Body>\n    <GetUserResponse xmlns="http://example.com/ws">\n      <UserId>1001</UserId>\n      <UserName>张三</UserName>\n      <Email>zhangsan@example.com</Email>\n    </GetUserResponse>\n  </soap:Body>\n</soap:Envelope>',
    },
    "xml_error": {
        "label": "XML 错误响应",
        "group": "xml",
        "status_code": 500,
        "content_type": "text/xml",
        "response_body": '<?xml version="1.0" encoding="UTF-8"?>\n<error>\n  <code>500</code>\n  <message>Internal Server Error</message>\n  <detail>An unexpected error occurred</detail>\n</error>',
    },

    # ── HTML 响应 ──
    "html_page": {
        "label": "HTML 页面",
        "group": "html",
        "status_code": 200,
        "content_type": "text/html",
        "response_body": '<!DOCTYPE html>\n<html lang="zh">\n<head><meta charset="UTF-8"><title>Mock Page</title></head>\n<body>\n  <h1>Hello, Mock!</h1>\n  <p>This is a mock HTML response for testing.</p>\n</body>\n</html>',
    },
    "html_404": {
        "label": "HTML 404 页面",
        "group": "html",
        "status_code": 404,
        "content_type": "text/html",
        "response_body": '<!DOCTYPE html>\n<html lang="zh">\n<head><meta charset="UTF-8"><title>404 Not Found</title></head>\n<body style="text-align:center;padding:80px 20px;font-family:sans-serif;">\n  <h1 style="font-size:72px;color:#ccc;">404</h1>\n  <p style="font-size:18px;color:#999;">Page Not Found</p>\n</body>\n</html>',
    },
    "html_500": {
        "label": "HTML 500 页面",
        "group": "html",
        "status_code": 500,
        "content_type": "text/html",
        "response_body": '<!DOCTYPE html>\n<html lang="zh">\n<head><meta charset="UTF-8"><title>500 Internal Server Error</title></head>\n<body style="text-align:center;padding:80px 20px;font-family:sans-serif;">\n  <h1 style="font-size:72px;color:#ff4d4f;">500</h1>\n  <p style="font-size:18px;color:#999;">Internal Server Error</p>\n</body>\n</html>',
    },

    # ── Text 响应 ──
    "text_ok": {
        "label": "纯文本 OK",
        "group": "text",
        "status_code": 200,
        "content_type": "text/plain",
        "response_body": "OK",
    },
    "text_csv": {
        "label": "CSV 数据",
        "group": "text",
        "status_code": 200,
        "content_type": "text/csv",
        "response_body": "id,name,email,status\n1,张三,zhangsan@example.com,active\n2,李四,lisi@example.com,inactive\n3,王五,wangwu@example.com,active",
        "response_headers": {"Content-Disposition": "attachment; filename=export.csv"},
    },
    "text_log": {
        "label": "日志输出",
        "group": "text",
        "status_code": 200,
        "content_type": "text/plain",
        "response_body": "[2026-06-18 10:30:01] INFO  - Application started on port 8080\n[2026-06-18 10:30:02] INFO  - Connected to database\n[2026-06-18 10:30:05] WARN  - Slow query detected (1523ms)\n[2026-06-18 10:30:10] ERROR - Connection timeout to redis:6379",
    },

    # ── HTTP 状态码系列 ──
    "status_200": {
        "label": "200 OK",
        "group": "status",
        "status_code": 200,
        "content_type": "application/json",
        "response_body": '{"status":"ok"}',
    },
    "status_201": {
        "label": "201 Created",
        "group": "status",
        "status_code": 201,
        "content_type": "application/json",
        "response_body": json.dumps({"id": 1, "message": "Resource created"}, indent=2),
    },
    "status_204": {
        "label": "204 No Content",
        "group": "status",
        "status_code": 204,
        "content_type": "text/plain",
        "response_body": "",
    },
    "status_301": {
        "label": "301 永久重定向",
        "group": "status",
        "status_code": 301,
        "content_type": "text/plain",
        "response_body": "Moved Permanently",
        "response_headers": {"Location": "https://example.com/new-url"},
    },
    "status_302": {
        "label": "302 临时重定向",
        "group": "status",
        "status_code": 302,
        "content_type": "text/plain",
        "response_body": "Found",
        "response_headers": {"Location": "https://example.com/login"},
    },
    "status_400": {
        "label": "400 Bad Request",
        "group": "status",
        "status_code": 400,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Bad Request", "message": "Invalid request parameters"}, indent=2),
    },
    "status_401": {
        "label": "401 Unauthorized",
        "group": "status",
        "status_code": 401,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Unauthorized", "message": "Authentication required"}, indent=2),
        "response_headers": {"WWW-Authenticate": "Bearer"},
    },
    "status_403": {
        "label": "403 Forbidden",
        "group": "status",
        "status_code": 403,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Forbidden", "message": "Access denied"}, indent=2),
    },
    "status_404": {
        "label": "404 Not Found",
        "group": "status",
        "status_code": 404,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Not Found", "message": "Resource not found"}, indent=2),
    },
    "status_429": {
        "label": "429 Too Many Requests",
        "group": "status",
        "status_code": 429,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Too Many Requests", "message": "Rate limit exceeded. Try again later."}, indent=2),
        "response_headers": {"Retry-After": "60", "X-RateLimit-Limit": "100", "X-RateLimit-Remaining": "0"},
    },
    "status_500": {
        "label": "500 Internal Server Error",
        "group": "status",
        "status_code": 500,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Internal Server Error", "message": "An unexpected error occurred"}, indent=2),
    },
    "status_502": {
        "label": "502 Bad Gateway",
        "group": "status",
        "status_code": 502,
        "content_type": "text/plain",
        "response_body": "502 Bad Gateway",
    },
    "status_503": {
        "label": "503 Service Unavailable",
        "group": "status",
        "status_code": 503,
        "content_type": "application/json",
        "response_body": json.dumps({"error": "Service Unavailable", "message": "The service is temporarily unavailable. Please try again later."}, indent=2),
        "response_headers": {"Retry-After": "30"},
    },
    "status_504": {
        "label": "504 Gateway Timeout",
        "group": "status",
        "status_code": 504,
        "content_type": "text/plain",
        "response_body": "504 Gateway Timeout",
    },
}


RANDOM_RESPONSES: list[dict] = [
    {"content_type": "application/json", "body": '{"code":0,"message":"success","data":{"id":1,"name":"test"}}'},
    {"content_type": "application/json", "body": '{"code":0,"message":"操作成功","data":null}'},
    {"content_type": "application/json", "body": '{"code":0,"data":{"list":[],"total":0,"page":1,"pageSize":20}}'},
    {"content_type": "application/json", "body": '{"code":0,"message":"查询成功","data":{"count":42,"average":3.14}}'},
    {"content_type": "application/json", "body": '{"status":"ok","timestamp":"2026-06-18T12:00:00Z","version":"1.0.0"}'},
    {"content_type": "application/json", "body": '{"result":true,"message":"任务已提交","taskId":"task-abc-123"}'},
    {"content_type": "application/json", "body": '{"code":0,"data":{"token":"eyJhbGciOiJIUzI1NiJ9.mock","expiresIn":3600}}'},
    {"content_type": "application/json", "body": '{"code":0,"message":"上传成功","data":{"url":"https://cdn.example.com/file.png","size":102400}}'},
    {"content_type": "text/plain", "body": "OK"},
    {"content_type": "text/plain", "body": "pong"},
    {"content_type": "application/json", "body": '{"healthy":true,"uptime":86400,"services":{"db":"ok","cache":"ok","queue":"ok"}}'},
    {"content_type": "application/json", "body": '{"code":0,"message":"删除成功","data":{"affected":1}}'},
]


def get_preset(key: str) -> dict | None:
    return PRESETS.get(key)


def list_presets() -> list[dict]:
    result = []
    for key, p in PRESETS.items():
        result.append({
            "key": key,
            "label": p["label"],
            "group": p["group"],
            "status_code": p["status_code"],
            "content_type": p["content_type"],
        })
    return result
