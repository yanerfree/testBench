"""Mock 服务启动的健壮性工具。

背景：各 Mock 服务用 `asyncio.create_task(uvicorn_server.serve())` 在主事件循环里
运行。uvicorn 绑端口失败时会调用 `sys.exit(1)` 抛出 **SystemExit**。SystemExit 属
BaseException，不被 `_restore_mock_services` 的 `except Exception` 捕获，且 asyncio 会把
它从 task 传播到主事件循环，直接把整个后端 uvicorn 进程干掉。

`guarded_serve` 把 serve() 包一层，SystemExit / 普通异常都只留在本 task 内并记日志，
绝不外泄；`await_started` 负责判定"到底起来没有"，供 start() 决定是否抛错。
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)


async def guarded_serve(server, label: str) -> None:
    """运行 uvicorn Server.serve()，但把 SystemExit（绑端口失败）关在本 task 内，
    避免它传播到主事件循环导致整个后端崩溃。CancelledError 正常向上传播（stop 时需要）。"""
    try:
        await server.serve()
    except asyncio.CancelledError:
        raise
    except SystemExit as e:
        port = getattr(getattr(server, "config", None), "port", "?")
        logger.error("%s 启动失败（端口 %s 可能被占用）：SystemExit %s", label, port, e)
    except Exception as e:  # 防御性：任何异常都不该让一个 mock 拖垮后端
        logger.error("%s 运行异常：%s", label, e)
