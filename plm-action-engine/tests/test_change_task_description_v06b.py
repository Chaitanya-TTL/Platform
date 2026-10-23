import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from pydantic import ValidationError

from plm_action_engine.approval import ApprovalService
from plm_action_engine.audit import AuditRepository
from plm_action_engine.clients import WindchillClient, WindchillClientError, WindchillSettings
from plm_action_engine.contracts import (
    ActionPreview, ApprovalRecord, ApprovalStatus,
    ChangeTaskDescriptionExecutionRequest, EnterpriseSystem, TargetReference,
)
from plm_action_engine.services import ChangeTaskDescriptionExecutionService
from plm_action_engine.storage import InMemoryApprovalRepository, InMemoryPreviewRepository

HASH = "a" * 64
TASK = "OR:wt.change2.WTChangeActivity2:1715126"
NOTICE = "OR:wt.change2.WTChangeOrder2:1715108"
DESC = "Steering material update review"


def request(**overrides):
    data = dict(action_plan_id="plan:1", plan_hash=HASH, approval_id="approval:1",
                requested_by="chaitanya", confirmation="EXECUTE_APPROVED_DESCRIPTION_UPDATE", duration=1)
    data.update(overrides)
    return ChangeTaskDescriptionExecutionRequest(**data)


def seeded():
    previews, approvals = InMemoryPreviewRepository(), InMemoryApprovalRepository()
    previews.save(ActionPreview(
        action_plan_id="plan:1", plan_hash=HASH,
        tool_name="windchill.update_change_task_description",
        target=TargetReference(system=EnterpriseSystem.WINDCHILL, entity_type="ChangeTask", native_id=TASK),
        current_values={"description": None, "version_id": "VR:1", "last_modified": "2026-09-24T12:14:11+05:30"},
        proposed_values={"description": DESC}, preconditions=[], ready_for_approval=True,
    ))
    approvals.save(ApprovalRecord(
        approval_id="approval:1", action_plan_id="plan:1", plan_hash=HASH,
        approved_by="reviewer", approval_reason="reviewed", status=ApprovalStatus.APPROVED,
        approved_at=datetime.now(timezone.utc), expires_at=datetime.now(timezone.utc)+timedelta(minutes=30),
    ))
    return previews, approvals


class FakeWindchill:
    writes_enabled = True
    def __init__(self, mismatch=False):
        self.task_reserved = False; self.notice_reserved = False; self.description = None
        self.mismatch = mismatch; self.patch_payload = None
    def get_change_task_by_oid(self, oid):
        return {"ID": TASK, "VersionID": "VR:1", "LastModified": "2026-09-24T12:14:11+05:30",
                "Description": ("wrong" if self.mismatch and self.description else self.description),
                "ReservedBy": "chaitanya" if self.task_reserved else None,
                "ChangeNoticeReference": {"ResourceID": f"ChangeNotices('{NOTICE}')"}}
    def get_change_notice_by_oid(self, oid):
        return {"ID": NOTICE, "ReservedBy": "chaitanya" if self.notice_reserved else None}
    def reserve_change_notice(self, oid, duration): self.notice_reserved = True
    def reserve_change_task(self, oid, duration): self.task_reserved = True
    def patch_change_task_description(self, oid, description): self.patch_payload = {"Description": description}; self.description = description
    def undo_change_task_reservation(self, oid, duration): self.task_reserved = False
    def undo_change_notice_reservation(self, oid, duration): self.notice_reserved = False


def test_wrong_confirmation_rejected():
    with pytest.raises(ValidationError): request(confirmation="YES")


def test_writes_disabled_by_default(tmp_path):
    previews, approvals = seeded()
    client = WindchillClient(WindchillSettings("http://wc/Windchill", "u", "p"))
    service = ChangeTaskDescriptionExecutionService(previews, approvals, ApprovalService(approvals, previews), client, AuditRepository(tmp_path/"audit.jsonl"))
    with pytest.raises(ValueError, match="writes are disabled"):
        service.execute(request())


def test_success_exact_patch_cleanup_and_audit(tmp_path):
    previews, approvals = seeded(); wc = FakeWindchill()
    audit = AuditRepository(tmp_path/"audit.jsonl")
    result = ChangeTaskDescriptionExecutionService(previews, approvals, ApprovalService(approvals, previews), wc, audit).execute(request())
    assert result.status == "VERIFIED_SUCCESS"
    assert result.description_modified is True and result.cleanup_complete is True
    assert wc.patch_payload == {"Description": DESC}
    text = (tmp_path/"audit.jsonl").read_text()
    assert "CHANGE_TASK_DESCRIPTION_EXECUTION_STARTED" in text
    assert "CHANGE_TASK_DESCRIPTION_EXECUTION_COMPLETED" in text
    assert "CSRF_NONCE" not in text and "Authorization" not in text


def test_readback_mismatch_fails_but_cleans_up(tmp_path):
    previews, approvals = seeded(); wc = FakeWindchill(mismatch=True)
    result = ChangeTaskDescriptionExecutionService(previews, approvals, ApprovalService(approvals, previews), wc, AuditRepository(tmp_path/"audit.jsonl")).execute(request())
    assert result.status == "FAILED"
    assert result.description_modified is False
    assert result.cleanup_complete is True
    assert not wc.task_reserved and not wc.notice_reserved


def test_httpx_mock_transport_nonce_internal_and_payload_exact():
    seen = []
    def handler(req: httpx.Request):
        seen.append(req)
        if req.method == "GET":
            return httpx.Response(200, headers={"content-type":"application/json"}, json={"NonceKey":"CSRF_NONCE", "NonceValue":"secret"})
        assert json.loads(req.content) == {"Description": DESC}
        assert req.headers["CSRF_NONCE"] == "secret"
        return httpx.Response(204)
    client = WindchillClient(WindchillSettings("http://wc/Windchill", "u", "p", writes_enabled=True), transport=httpx.MockTransport(handler))
    assert client.patch_change_task_description(TASK, DESC) == {}
    assert all(b"secret" not in (r.content or b"") for r in seen)
