"""
tea_step — 业务语义步骤标记器。

脚本中使用 `with tea_step("xxx", phase="action")` 标记业务步骤，
tea_capture.py 会将 HTTP 请求自动归入当前步骤的 requests 列表。

Usage:
    from tea_step import tea_step

    async def test_create_user(self, client, db_session):
        with tea_step("管理员登录", phase="setup"):
            headers = await login_as(client)

        with tea_step("创建新用户", phase="action"):
            resp = await client.post("/api/users", headers=headers, json={...})

        with tea_step("验证返回 201", phase="verify"):
            assert resp.status_code == 201
"""
import json
import os
import time
from contextlib import contextmanager
from pathlib import Path

_current_steps: list[dict] = []
_step_stack: list[dict] = []
_output_dir: Path | None = None


@contextmanager
def tea_step(name: str, phase: str = "action"):
    step = {
        "seq": len(_current_steps) + 1,
        "action": name,
        "phase": phase,
        "status": "passed",
        "duration_ms": 0,
        "requests": [],
        "_start": time.monotonic(),
    }
    _current_steps.append(step)
    _step_stack.append(step)
    # 实时进度标记
    print(f'##STEP_START##{json.dumps({"seq": step["seq"], "action": name, "phase": phase}, ensure_ascii=False)}', flush=True)
    try:
        yield step
    except Exception as e:
        step["status"] = "failed"
        step["error"] = str(e)[:2000]
        raise
    finally:
        step["duration_ms"] = int((time.monotonic() - step.pop("_start")) * 1000)
        if _step_stack and _step_stack[-1] is step:
            _step_stack.pop()
        print(f'##STEP_END##{json.dumps({"seq": step["seq"], "status": step["status"], "duration_ms": step["duration_ms"], "error": step.get("error", "")[:200]}, ensure_ascii=False)}', flush=True)


def current_step() -> dict | None:
    """返回当前活跃的 tea_step，供 tea_capture 挂载 HTTP 请求。"""
    return _step_stack[-1] if _step_stack else None


def get_steps() -> list[dict]:
    """返回当前测试函数收集到的所有步骤。"""
    return _current_steps


def reset():
    """清空步骤（每个测试函数开始时调用）。"""
    _current_steps.clear()
    _step_stack.clear()


def flush_steps(test_key: str):
    """将步骤写入 JSON 文件，然后重置。"""
    if not _current_steps or not _output_dir:
        reset()
        return

    out_path = _output_dir / f"{test_key}.json"
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(_current_steps, f, ensure_ascii=False, default=str)
    except Exception:
        pass
    reset()


def configure_output(directory: str | Path):
    """设置步骤 JSON 输出目录。"""
    global _output_dir
    _output_dir = Path(directory)
    _output_dir.mkdir(parents=True, exist_ok=True)
