from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

import httpx

from plm_action_engine.approval import ApprovalService
from plm_action_engine.audit import AuditRepository
from plm_action_engine.clients import WindchillClient, WindchillSettings
from plm_action_engine.contracts import (
    ActionPreview,
    ApprovalRecord,
    ApprovalStatus,
    EnterpriseSystem,
    PreconditionResult,
    ReservationRoundTripRequest,
    TargetReference,
)
from plm_action_engine.services import ReservationRoundTripService
from plm_action_engine.storage import JsonApprovalRepository, JsonFileStore, JsonPreviewRepository

TASK_OID = "OR:wt.change2.WTChangeActivity2:1715126"
NOTICE_OID = "OR:wt.change2.WTChangeOrder2:1715108"
state = {"task_reserved": False, "notice_reserved": False}


def handler(request: httpx.Request) -> httpx.Response:
    url = unquote(str(request.url))
    if "GetCSRFToken" in url:
        return httpx.Response(200, headers={"content-type":"application/json"}, json={
            "NonceKey":"CSRF_NONCE", "NonceValue":"secret"
        })
    if request.method == "POST":
        assert request.headers.get("CSRF_NONCE") == "secret"
        if "ChangeNotices" in url:
            state["notice_reserved"] = "UndoReservation" not in url
        if "ChangeTasks" in url:
            state["task_reserved"] = "UndoReservation" not in url
        return httpx.Response(200, headers={"content-type":"application/json"}, json={})
    if "ChangeNotices" in url:
        return httpx.Response(200, headers={"content-type":"application/json"}, json={
            "ID":NOTICE_OID,
            "ReservedBy":"Test User" if state["notice_reserved"] else None,
        })
    return httpx.Response(200, headers={"content-type":"application/json"}, json={
        "ID":TASK_OID,
        "Number":"00136",
        "Description":None,
        "VersionID":"VR:wt.change2.WTChangeActivity2:1715125",
        "LastModified":"2026-09-24T12:14:11+05:30",
        "ReservedBy":"Test User" if state["task_reserved"] else None,
        "ChangeNoticeReference":{
            "ResourceID":f"http://test/ChangeNotices('{NOTICE_OID}')"
        },
    })


def test_reserve_verify_unreserve_cleanup(tmp_path: Path) -> None:
    state["task_reserved"] = False
    state["notice_reserved"] = False
    previews = JsonPreviewRepository(JsonFileStore(tmp_path / "previews.json"))
    approvals = JsonApprovalRepository(JsonFileStore(tmp_path / "approvals.json"))
    preview = previews.save(ActionPreview(
        action_plan_id="plan:test",
        plan_hash="a"*64,
        tool_name="windchill.update_change_task_description",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            native_id=TASK_OID,
            number="00136",
            expected_version="VR:wt.change2.WTChangeActivity2:1715125",
            expected_last_modified=datetime.fromisoformat("2026-09-24T12:14:11+05:30"),
        ),
        current_values={"description":None},
        proposed_values={"description":"Updated"},
        preconditions=[PreconditionResult(name="TARGET_EXISTS",satisfied=True,message="ok")],
        ready_for_approval=True,
    ))
    approval = approvals.save(ApprovalRecord(
        approval_id="approval:test",
        action_plan_id=preview.action_plan_id,
        plan_hash=preview.plan_hash,
        approved_by="chaitanya",
        approval_reason="approved",
        status=ApprovalStatus.APPROVED,
        approved_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc)+timedelta(minutes=30),
    ))
    client=WindchillClient(
        WindchillSettings("http://test/Windchill","u","p"),
        transport=httpx.MockTransport(handler),
    )
    result=ReservationRoundTripService(
        previews, approvals, ApprovalService(approvals,previews), client,
        AuditRepository(tmp_path / "audit.jsonl"),
    ).execute(ReservationRoundTripRequest(
        action_plan_id=preview.action_plan_id,
        plan_hash=preview.plan_hash,
        approval_id=approval.approval_id,
        requested_by="chaitanya",
        confirmation="RESERVE_AND_RELEASE",
    ))
    assert result.status == "VERIFIED_SUCCESS"
    assert result.cleanup_complete is True
    assert result.description_modified is False
    assert state == {"task_reserved": False, "notice_reserved": False}
