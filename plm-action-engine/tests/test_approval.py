from datetime import datetime, timezone

import pytest

from plm_action_engine.approval import ApprovalService, compute_plan_hash
from plm_action_engine.contracts import (
    ActionPreview,
    ApprovalRequest,
    EnterpriseSystem,
    PreconditionResult,
    TargetReference,
)
from plm_action_engine.storage import InMemoryApprovalRepository, InMemoryPreviewRepository


def make_preview() -> ActionPreview:
    payload = {
        "action_plan_id": "plan:test",
        "tool_name": "windchill.update_change_task_description",
        "target": {
            "system": "WINDCHILL",
            "entity_type": "CHANGE_TASK",
            "native_id": "OR:test:1",
            "number": "00136",
            "expected_version": "VR:test:1",
            "expected_last_modified": "2026-10-22T10:00:00Z",
        },
        "current_values": {"description": None},
        "proposed_values": {"description": "Updated"},
        "preconditions": [{"name": "TARGET_EXISTS", "satisfied": True}],
    }
    return ActionPreview(
        action_plan_id="plan:test",
        plan_hash=compute_plan_hash(payload),
        tool_name="windchill.update_change_task_description",
        target=TargetReference(
            system=EnterpriseSystem.WINDCHILL,
            entity_type="CHANGE_TASK",
            native_id="OR:test:1",
            number="00136",
            expected_version="VR:test:1",
            expected_last_modified=datetime.now(timezone.utc),
        ),
        current_values={"description": None},
        proposed_values={"description": "Updated"},
        preconditions=[PreconditionResult(
            name="TARGET_EXISTS", satisfied=True, message="Resolved"
        )],
        ready_for_approval=True,
        ready_for_execution=False,
    )


def test_hash_is_deterministic() -> None:
    first = compute_plan_hash({"b": 2, "a": 1})
    second = compute_plan_hash({"a": 1, "b": 2})
    assert first == second
    assert len(first) == 64


def test_approval_is_bound_to_exact_plan_hash() -> None:
    preview_repo = InMemoryPreviewRepository()
    approval_repo = InMemoryApprovalRepository()
    preview = preview_repo.save(make_preview())
    service = ApprovalService(approval_repo, preview_repo)

    record = service.approve(ApprovalRequest(
        action_plan_id=preview.action_plan_id,
        plan_hash=preview.plan_hash,
        approved_by="chaitanya",
        approval_reason="Reviewed exact before and after values",
    ))

    assert record.plan_hash == preview.plan_hash
    assert service.validate(preview.action_plan_id, preview.plan_hash).valid is True


def test_rejects_stale_or_modified_plan_hash() -> None:
    preview_repo = InMemoryPreviewRepository()
    approval_repo = InMemoryApprovalRepository()
    preview = preview_repo.save(make_preview())
    service = ApprovalService(approval_repo, preview_repo)

    with pytest.raises(ValueError, match="Plan hash mismatch"):
        service.approve(ApprovalRequest(
            action_plan_id=preview.action_plan_id,
            plan_hash="0" * 64,
            approved_by="chaitanya",
            approval_reason="Wrong hash",
        ))
