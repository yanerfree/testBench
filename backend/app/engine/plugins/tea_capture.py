"""
TEA Capture — pytest plugin that auto-captures HTTP request/response data.

Patches httpx.AsyncClient.send and httpx.Client.send to record every HTTP call,
then writes a step JSON file after each test function completes.

Activated via: pytest -p tea_capture
Output dir controlled by env var TEA_CAPTURE_DIR (default: .tea_results)
"""
import json
import os
import time
from pathlib import Path

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

_captures: dict[str, list[dict]] = {}
_current_test: str | None = None
_original_async_send = None
_original_sync_send = None
_output_dir: Path = Path(".tea_results")

MAX_BODY_SIZE = 10 * 1024


def _safe_body(content, content_type: str = "") -> dict | str | None:
    if content is None:
        return None
    if isinstance(content, (dict, list)):
        raw = json.dumps(content, ensure_ascii=False)
        if len(raw) > MAX_BODY_SIZE:
            return {"_truncated": True, "_size": len(raw), "_preview": raw[:2000]}
        return content
    if isinstance(content, bytes):
        if not content:
            return None
        ct = content_type.lower()
        if "json" in ct or "text" in ct or "xml" in ct or "html" in ct or "form" in ct:
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                return {"_binary": True, "_size": len(content)}
            if len(text) > MAX_BODY_SIZE:
                return {"_truncated": True, "_size": len(text), "_preview": text[:2000]}
            try:
                return json.loads(text)
            except (json.JSONDecodeError, ValueError):
                return text
        return {"_binary": True, "_size": len(content)}
    if isinstance(content, str):
        if len(content) > MAX_BODY_SIZE:
            return {"_truncated": True, "_size": len(content), "_preview": content[:2000]}
        try:
            return json.loads(content)
        except (json.JSONDecodeError, ValueError):
            return content
    return str(content)


def _headers_dict(headers) -> dict:
    if headers is None:
        return {}
    return dict(headers)


def _build_capture(request, response, duration_ms: int) -> dict:
    req_ct = str(request.headers.get("content-type", ""))
    resp_ct = str(response.headers.get("content-type", ""))
    raw_url = str(request.url)
    path = request.url.path if hasattr(request.url, "path") else raw_url
    return {
        "step": f"{request.method} {path}",
        "method": request.method,
        "url": raw_url,
        "status_code": response.status_code,
        "status": "passed" if response.status_code < 400 else "failed",
        "duration_ms": duration_ms,
        "request": {
            "headers": _headers_dict(request.headers),
            "body": _safe_body(request.content, req_ct),
        },
        "response": {
            "headers": _headers_dict(response.headers),
            "body": _safe_body(response.content, resp_ct),
        },
        "assertions": [],
    }


async def _patched_async_send(self, request, **kwargs):
    start = time.monotonic()
    response = await _original_async_send(self, request, **kwargs)
    duration_ms = int((time.monotonic() - start) * 1000)

    if _current_test is not None:
        try:
            capture = _build_capture(request, response, duration_ms)
            _captures.setdefault(_current_test, []).append(capture)
        except Exception:
            pass
    return response


def _patched_sync_send(self, request, **kwargs):
    start = time.monotonic()
    response = _original_sync_send(self, request, **kwargs)
    duration_ms = int((time.monotonic() - start) * 1000)

    if _current_test is not None:
        try:
            capture = _build_capture(request, response, duration_ms)
            _captures.setdefault(_current_test, []).append(capture)
        except Exception:
            pass
    return response


def _install_patches():
    global _original_async_send, _original_sync_send
    if not HAS_HTTPX:
        return
    if _original_async_send is None:
        _original_async_send = httpx.AsyncClient.send
        httpx.AsyncClient.send = _patched_async_send
    if _original_sync_send is None:
        _original_sync_send = httpx.Client.send
        httpx.Client.send = _patched_sync_send


def _uninstall_patches():
    global _original_async_send, _original_sync_send
    if not HAS_HTTPX:
        return
    if _original_async_send is not None:
        httpx.AsyncClient.send = _original_async_send
        _original_async_send = None
    if _original_sync_send is not None:
        httpx.Client.send = _original_sync_send
        _original_sync_send = None


def pytest_configure(config):
    global _output_dir
    _output_dir = Path(os.environ.get("TEA_CAPTURE_DIR", ".tea_results"))
    _output_dir.mkdir(parents=True, exist_ok=True)


def pytest_runtest_setup(item):
    global _current_test
    # 使用 nodeid 中的 Class::method 格式作为 key，匹配 script_ref_func
    # nodeid 例: tests/e2e/test_smoke.py::TestClass::test_func
    parts = item.nodeid.split("::")
    _current_test = "::".join(parts[1:]) if len(parts) > 1 else item.name
    _captures[_current_test] = []
    _install_patches()


def _test_key(item):
    parts = item.nodeid.split("::")
    return "::".join(parts[1:]) if len(parts) > 1 else item.name


def pytest_runtest_makereport(item, call):
    if call.when != "call":
        return
    key = _test_key(item)
    steps = _captures.get(key, [])
    if not steps:
        return
    if call.excinfo is not None:
        last_step = steps[-1]
        last_step["status"] = "failed"
        err_text = str(call.excinfo.value)[:2000]
        last_step["error"] = err_text
        last_step["assertions"].append({
            "passed": False,
            "description": err_text,
        })
    else:
        for step in steps:
            if not step["assertions"]:
                step["assertions"].append({
                    "passed": True,
                    "description": f"{step['method']} {step['url']} -> {step['status_code']}",
                })


def pytest_runtest_teardown(item):
    global _current_test
    key = _test_key(item)
    steps = _captures.pop(key, [])
    _current_test = None

    if not steps:
        return

    out_path = _output_dir / f"{key}.json"
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(steps, f, ensure_ascii=False, default=str)
    except Exception:
        pass


def pytest_unconfigure(config):
    _uninstall_patches()
