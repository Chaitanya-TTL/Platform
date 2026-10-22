from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from plm_action_engine.approval import ApprovalService
from plm_action_engine.audit import AuditRepository
from plm_action_engine.clients import WindchillClient, WindchillSettings
from plm_action_engine.contracts import (
    ActionPreview,
    ApprovalRecord,
    ApprovalStatus,
    EnterpriseSystem,
    ExecutionReadinessRequest,
    PreconditionResult,
    TargetReference,
)
from plm_action_engine.services import ExecutionReadinessService
from plm_action_engine.storage import JsonApprovalRepository, JsonFileStore, JsonPreviewRepository


RECORD = {
    "ID": "OR:wt.change2.WTChangeActivity2:1715126",
    "Number": "00136",
    "Description": None,
    "VersionID": "VR:wt.change2.WTChangeActivity2:1715125",
    "LastModified": "2026-09-24T12:14:11+05:30",
    "ReservedBy": None,
    "State": {"Value": "IMPLEMENTATION", "Display": "Implementation"},
}


def handler(request: httpx.Request) -> httpx.Response:
    if "GetCSRFToken" in str(request.url):
        return httpx.Response(200, headers={"content-type":"application/json"}, json={
            "NonceKey":"CSRF_NONCE", "NonceValue":"secret-do-not-expose"
        })
    return httpx.Response(200, headers={"content-type":"application/json"}, json=RECORD)


def test_persistent_readiness_does_not_expose_nonce(tmp_path: Path) -> None:
    previews = JsonPreviewRepository(JsonFileStore(tmp_path / "previews.json"))
    approvals = JsonApprovalRepository(JsonFileStore(tmp_path / "approvals.json"))
    preview = previews.save(ActionPreview(
        action_plan_id="plan:test",
        plan_hash="a"*64,
        tool_name="windchill.update_change_task_description",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            native_id=RECORD["ID"],
            number="00136",
            expected_version=RECORD["VersionID"],
            expected_last_modified=datetime.fromisoformat(RECORD["LastModified"]),
        ),
        current_values={"description": None},
        proposed_values={"description":"Updated"},
        preconditions=[PreconditionResult(name="TARGET_EXISTS",satisfied=True,message="ok")],
        ready_for_approval=True,
    ))
    approval = approvals.save(ApprovalRecord(
        approval_id="approval:test",
        action_plan_id=preview.action_plan_id,
        plan_hash=preview.plan_hash,
        approved_by="chaitanya",
        approval_reason="reviewed",
        status=ApprovalStatus.APPROVED,
        approved_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc)+timedelta(minutes=30),
    ))
    client=WindchillClient(
        WindchillSettings("http://test/Windchill","u","p"),
        transport=httpx.MockTransport(handler),
    )
    result=ExecutionReadinessService(
        previews, approvals, ApprovalService(approvals,previews), client,
        AuditRepository(tmp_path / "audit.jsonl"),
    ).check(ExecutionReadinessRequest(
        action_plan_id=preview.action_plan_id,
        plan_hash=preview.plan_hash,
        approval_id=approval.approval_id,
        requested_by="chaitanya",
    ))
    assert result.dry_run_only is True
    assert result.ready_for_execution is False
    assert any(c.name=="CSRF_NONCE_AVAILABLE" and c.satisfied for c in result.checks)
    assert "secret-do-not-expose" not in result.model_dump_json()
    assert (tmp_path / "audit.jsonl").exists()
