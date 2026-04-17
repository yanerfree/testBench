"""Unit 测试 — core/audit.py 审计上下文与装饰器辅助函数"""
import uuid

import pytest

from app.core.audit import _extract_target_info, get_audit_context, set_audit_context


class TestAuditContext:

    @pytest.mark.unit
    def test_set_and_get_context(self):
        uid = uuid.uuid4()
        set_audit_context(user_id=uid, trace_id="t-001", project_id=None)
        ctx = get_audit_context()
        assert ctx["user_id"] == uid
        assert ctx["trace_id"] == "t-001"
        assert ctx["project_id"] is None

    @pytest.mark.unit
    def test_overwrite_context(self):
        uid1 = uuid.uuid4()
        uid2 = uuid.uuid4()
        set_audit_context(user_id=uid1, trace_id="t-old")
        set_audit_context(user_id=uid2, trace_id="t-new")
        ctx = get_audit_context()
        assert ctx["user_id"] == uid2
        assert ctx["trace_id"] == "t-new"


class TestExtractTargetInfo:

    @pytest.mark.unit
    def test_orm_object_with_name(self):
        class FakeObj:
            id = uuid.uuid4()
            name = "my-project"
        target_id, target_name = _extract_target_info(FakeObj())
        assert target_id == FakeObj.id
        assert target_name == "my-project"

    @pytest.mark.unit
    def test_orm_object_with_username(self):
        class FakeUser:
            id = uuid.uuid4()
            username = "alice"
        target_id, target_name = _extract_target_info(FakeUser())
        assert target_name == "alice"

    @pytest.mark.unit
    def test_orm_object_with_title(self):
        class FakeCase:
            id = uuid.uuid4()
            title = "login test"
        _, target_name = _extract_target_info(FakeCase())
        assert target_name == "login test"

    @pytest.mark.unit
    def test_none_returns_none(self):
        target_id, target_name = _extract_target_info(None)
        assert target_id is None
        assert target_name is None

    @pytest.mark.unit
    def test_object_without_name_fields(self):
        class Bare:
            id = uuid.uuid4()
        target_id, target_name = _extract_target_info(Bare())
        assert target_id == Bare.id
        assert target_name is None
