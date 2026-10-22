from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from plm_action_engine.contracts import (
    ApprovalRecord,
    ApprovalRequest,
    ApprovalStatus,
    ApprovalValidation,
)
from plm_action_engine.storage import ApprovalRepository, PreviewRepository


class ApprovalService:
    def __init__(
        self,
        approvals: ApprovalRepository,
        previews: PreviewRepository,
    ) -> None:
        self._approvals = approvals
        self._previews = previews

    def approve(self, request: ApprovalRequest) -> ApprovalRecord:
        preview = self._previews.get(request.action_plan_id)
        if preview is None:
            raise ValueError(f"Action preview not found: {request.action_plan_id}")
        if not preview.ready_for_approval:
            raise ValueError("Action preview is not ready for approval")
        if preview.plan_hash != request.plan_hash:
            raise ValueError("Plan hash mismatch: preview has changed or request is stale")

        existing = self._approvals.find_by_plan(request.action_plan_id, request.plan_hash)
        if existing and existing.status == ApprovalStatus.APPROVED:
            return existing

        now = datetime.now(timezone.utc)
        record = ApprovalRecord(
            approval_id=f"approval:{uuid4()}",
            action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash,
            approved_by=request.approved_by,
            approval_reason=request.approval_reason,
            status=ApprovalStatus.APPROVED,
            approved_at=now,
            expires_at=now + timedelta(minutes=request.expires_in_minutes),
            metadata={"ready_for_execution": False},
        )
        return self._approvals.save(record)

    def validate(self, action_plan_id: str, plan_hash: str) -> ApprovalValidation:
        record = self._approvals.find_by_plan(action_plan_id, plan_hash)
        if record is None:
            return ApprovalValidation(
                valid=False,
                action_plan_id=action_plan_id,
                plan_hash=plan_hash,
                errors=["No approval exists for this exact plan hash"],
            )

        now = datetime.now(timezone.utc)
        if record.status != ApprovalStatus.APPROVED:
            return ApprovalValidation(
                valid=False,
                approval_id=record.approval_id,
                action_plan_id=action_plan_id,
                plan_hash=plan_hash,
                status=record.status,
                errors=[f"Approval status is {record.status}"],
            )
        if now >= record.expires_at:
            record.status = ApprovalStatus.EXPIRED
            self._approvals.save(record)
            return ApprovalValidation(
                valid=False,
                approval_id=record.approval_id,
                action_plan_id=action_plan_id,
                plan_hash=plan_hash,
                status=ApprovalStatus.EXPIRED,
                errors=["Approval has expired"],
            )

        return ApprovalValidation(
            valid=True,
            approval_id=record.approval_id,
            action_plan_id=action_plan_id,
            plan_hash=plan_hash,
            status=record.status,
        )
