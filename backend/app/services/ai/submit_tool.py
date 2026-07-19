"""submit_script LangChain tool — Agent 提交脚本到共享 state。

照搬 ThemisAI submit_tool.py。
"""
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field


class SubmitScriptInput(BaseModel):
    script_content: str = Field(description="完整的 .spec.ts Playwright Test 脚本内容")


def create_submit_tool(shared_state: dict) -> StructuredTool:
    async def _submit(script_content: str) -> str:
        if not script_content.strip():
            return "SUBMIT ERROR: 脚本内容为空，请传入完整的 .spec.ts 内容。"
        shared_state["script_content"] = script_content
        shared_state["version"] = shared_state.get("version", 0) + 1
        v = shared_state["version"]
        return (
            f"SCRIPT SUBMITTED (v{v}): 脚本已保存。"
            f"请调用 verify_script 验证脚本是否能通过执行。"
        )

    return StructuredTool.from_function(
        coroutine=_submit,
        name="submit_script",
        description=(
            "提交生成的 Playwright Test 脚本（.spec.ts）。"
            "传入完整脚本内容。提交后必须调用 verify_script 验证。"
            "如果验证失败，修复后再次调用此工具覆盖提交，然后再验证。"
        ),
        args_schema=SubmitScriptInput,
    )
