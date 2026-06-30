"""TestForge task 生成服务 — 组装 task JSON 并保存到 testforge/tasks/"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.core.security import create_access_token

TASKS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "testforge" / "tasks"


def _ensure_tasks_dir() -> Path:
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    return TASKS_DIR


def generate_task(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    user_id: uuid.UUID,
    user_role: str,
    target: dict,
    interface_info: str,
    business_rules: list[str],
    api_url: str = "http://localhost:8000",
) -> dict:
    task_id = f"tf-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"

    token = create_access_token(user_id, user_role)

    script_dir = target.get("script_dir")
    if not script_dir:
        module_slug = target["module"].replace("-", "_")
        script_dir = f"tests/api/{module_slug}"
        target["script_dir"] = script_dir

    task = {
        "task_id": task_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending",
        "platform": {
            "api_url": api_url,
            "token": token,
            "project_id": str(project_id),
            "branch_id": str(branch_id),
        },
        "target": target,
        "interface_info": interface_info,
        "business_rules": business_rules,
    }

    task_path = _ensure_tasks_dir() / f"{task_id}.json"
    task_path.write_text(json.dumps(task, ensure_ascii=False, indent=2))

    return task


def list_tasks() -> list[dict]:
    tasks_dir = _ensure_tasks_dir()
    tasks = []
    for f in sorted(tasks_dir.glob("tf-*.json"), reverse=True):
        try:
            task = json.loads(f.read_text())
            tasks.append({
                "task_id": task.get("task_id"),
                "created_at": task.get("created_at"),
                "status": task.get("status", "unknown"),
                "target_module": task.get("target", {}).get("module", ""),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return tasks


def update_task_status(task_id: str, status: str) -> dict | None:
    tasks_dir = _ensure_tasks_dir()
    task_path = tasks_dir / f"{task_id}.json"
    if not task_path.exists():
        return None
    task = json.loads(task_path.read_text())
    task["status"] = status
    task["updated_at"] = datetime.now(timezone.utc).isoformat()
    task_path.write_text(json.dumps(task, ensure_ascii=False, indent=2))
    return task


def get_task(task_id: str) -> dict | None:
    task_path = _ensure_tasks_dir() / f"{task_id}.json"
    if not task_path.exists():
        return None
    return json.loads(task_path.read_text())
