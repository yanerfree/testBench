"""
test_extractor_anchoring — 原文引用三级锚定降级（ft S2.3 / ADR-8）
Test ID: FT.2.3-UNIT-001
Priority: P0
"""
import pytest
from app.services.scenario_gen.extractor import anchor_quote


class TestAnchorQuote:

    def test_exact_match_anchored(self):
        doc = "用户可对已发货订单发起部分退款，退款金额不超过订单总额。"
        quote = "用户可对已发货订单发起部分退款"
        status, offset = anchor_quote(doc, quote)
        assert status == "anchored"
        assert offset == 0

    def test_exact_match_mid_document(self):
        doc = "# 需求\n## 退款\n退款金额不超过订单总额。\n## 审批\n需要审批。"
        quote = "退款金额不超过订单总额"
        status, offset = anchor_quote(doc, quote)
        assert status == "anchored"
        assert offset > 0

    def test_fuzzy_whitespace_difference(self):
        doc = "用户  可对   已发货订单发起退款"
        quote = "用户 可对 已发货订单发起退款"
        status, offset = anchor_quote(doc, quote)
        assert status == "fuzzy"

    def test_fuzzy_llm_slight_rewrite(self):
        doc = "系统应在用户提交退款申请后24小时内完成审批流程，并通过邮件和短信通知用户结果。"
        quote = "系统应在用户提交退款申请后24小时内完成审批流程并通过邮件短信通知用户结果"
        status, offset = anchor_quote(doc, quote)
        assert status == "fuzzy"

    def test_unanchored_fabricated_quote(self):
        doc = "用户可以登录系统查看订单。"
        quote = "管理员可以批量删除过期工单并归档历史记录"
        status, offset = anchor_quote(doc, quote)
        assert status == "unanchored"
        assert offset is None

    def test_empty_quote_unanchored(self):
        status, offset = anchor_quote("doc content", "")
        assert status == "unanchored"
        assert offset is None

    def test_none_like_quote_unanchored(self):
        status, offset = anchor_quote("doc content", "   ")
        assert status == "unanchored"
