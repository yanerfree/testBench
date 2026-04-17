"""钉钉通知服务 — 执行完成/熔断时推送消息"""
import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_fixed

from app.models.environment import NotificationChannel
from app.models.plan import Plan

logger = logging.getLogger(__name__)


@retry(stop=stop_after_attempt(3), wait=wait_fixed(2), reraise=False)
async def _send_webhook(webhook_url: str, payload: dict) -> bool:
    """发送钉钉 Webhook 消息，最多重试 3 次。"""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(webhook_url, json=payload)
        resp.raise_for_status()
        return True


def _build_message(
    trigger: str,
    plan_name: str,
    project_name: str,
    total: int,
    passed: int,
    failed: int,
    skipped: int,
    pass_rate: float | None,
) -> dict:
    """构建钉钉 Markdown 消息体。"""
    rate_text = f"{pass_rate}%" if pass_rate is not None else "-"
    status_emoji = "✅" if trigger == "completed" and (pass_rate or 0) >= 95 else "⚠️" if trigger == "completed" else "🚨"

    title = f"{status_emoji} 测试{'完成' if trigger == 'completed' else '熔断'}: {plan_name}"
    text = (
        f"### {title}\n\n"
        f"- **项目**: {project_name}\n"
        f"- **计划**: {plan_name}\n"
        f"- **触发**: {'执行完成' if trigger == 'completed' else '熔断暂停'}\n"
        f"- **总用例**: {total}\n"
        f"- **通过**: {passed} | **失败**: {failed} | **跳过**: {skipped}\n"
        f"- **通过率**: {rate_text}\n"
    )

    return {
        "msgtype": "markdown",
        "markdown": {"title": title, "text": text},
    }


async def notify_plan_result(
    session: AsyncSession,
    plan: Plan,
    project_name: str,
    trigger: str = "completed",
    total: int = 0,
    passed: int = 0,
    failed: int = 0,
    skipped: int = 0,
    pass_rate: float | None = None,
) -> bool:
    """向计划配置的通知渠道发送钉钉消息。

    trigger: "completed" | "circuit_break"
    返回 True 表示发送成功，False 表示跳过或失败。
    """
    # 手动计划不发通知
    if plan.plan_type == "manual":
        return False

    if not plan.channel_id:
        return False

    # 加载渠道
    result = await session.execute(
        select(NotificationChannel).where(NotificationChannel.id == plan.channel_id)
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        logger.warning("通知渠道 %s 不存在", plan.channel_id)
        return False

    # 构建消息
    payload = _build_message(
        trigger=trigger,
        plan_name=plan.name,
        project_name=project_name,
        total=total, passed=passed, failed=failed, skipped=skipped,
        pass_rate=pass_rate,
    )

    # 发送
    try:
        await _send_webhook(channel.webhook_url, payload)
        logger.info("钉钉通知发送成功: plan=%s, channel=%s", plan.id, channel.name)
        return True
    except Exception:
        logger.exception("钉钉通知发送失败: plan=%s, channel=%s", plan.id, channel.name)
        return False
