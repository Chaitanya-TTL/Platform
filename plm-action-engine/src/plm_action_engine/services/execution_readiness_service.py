from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from plm_action_engine.audit import AuditEvent, AuditRepository
from plm_action_engine.approval import ApprovalService
from plm_action_engine.clients import WindchillClient
from plm_action_engine.contracts import (
    ExecutionReadinessRequest,
    ExecutionReadinessResult,
    ReadinessCheck,
)
from plm_action_engine.storage import ApprovalRepository, PreviewRepository


class ExecutionReadinessService:
    def __init__(
        self,
        previews: PreviewRepository,
        approvals: ApprovalRepository,
        approval_service: ApprovalService,
        windchill: WindchillClient,
        audit: AuditRepository,
    ) -> None:
        self._previews = previews
        self._approvals = approvals
        self._approval_service = approval_service
        self._windchill = windchill
        self._audit = audit

    def check(self, request: ExecutionReadinessRequest) -> ExecutionReadinessResult:
        preview = self._previews.get(request.action_plan_id)
        approval = self._approvals.get(request.approval_id)
        checks: list[ReadinessCheck] = []

        checks.append(ReadinessCheck(
            name="PREVIEW_EXISTS",
            satisfied=preview is not None,
            message="Stored preview found." if preview else "Stored preview not found.",
        ))
        checks.append(ReadinessCheck(
            name="APPROVAL_EXISTS",
            satisfied=approval is not None,
            message="Stored approval found." if approval else "Stored approval not found.",
        ))

        if preview is None or approval is None:
            return self._result(request, checks, {}, ["Dry-run readiness only."])

        approval_validation = self._approval_service.validate(
            request.action_plan_id, request.plan_hash
        )
        checks.append(ReadinessCheck(
            name="APPROVAL_VALID",
            satisfied=approval_validation.valid,
            message=("Approval is valid." if approval_validation.valid else "; ".join(approval_validation.errors)),
        ))
        checks.append(ReadinessCheck(
            name="APPROVAL_ID_MATCHES",
            satisfied=approval.approval_id == request.approval_id,
            message="Approval ID matches." if approval.approval_id == request.approval_id else "Approval ID mismatch.",
        ))
        checks.append(ReadinessCheck(
            name="PLAN_HASH_MATCHES",
            satisfied=preview.plan_hash == request.plan_hash == approval.plan_hash,
            message="Preview and approval hashes match." if preview.plan_hash == request.plan_hash == approval.plan_hash else "Plan hash mismatch.",
        ))

        current = self._windchill.get_change_task_by_oid(preview.target.native_id or "")
        current = current or {}
        state = current.get("State") or {}
        current_description = current.get("Description")
        current_version = current.get("VersionID")
        current_modified = current.get("LastModified")
        current_reserved_by = current.get("ReservedBy")

        checks.extend([
            ReadinessCheck(
                name="TARGET_STILL_EXISTS",
                satisfied=bool(current),
                message="Target still exists." if current else "Target no longer exists.",
            ),
            ReadinessCheck(
                name="VERSION_UNCHANGED",
                satisfied=current_version == preview.target.expected_version,
                message="Version is unchanged." if current_version == preview.target.expected_version else "Version changed after preview.",
            ),
            ReadinessCheck(
                name="LAST_MODIFIED_UNCHANGED",
                satisfied=current_modified == preview.target.expected_last_modified.isoformat() if preview.target.expected_last_modified else False,
                message="LastModified is unchanged." if (preview.target.expected_last_modified and current_modified == preview.target.expected_last_modified.isoformat()) else "LastModified changed after preview.",
            ),
            ReadinessCheck(
                name="CURRENT_VALUE_UNCHANGED",
                satisfied=current_description == preview.current_values.get("description"),
                message="Current description is unchanged." if current_description == preview.current_values.get("description") else "Current description changed after preview.",
            ),
            ReadinessCheck(
                name="NOT_RESERVED_BY_ANOTHER_USER",
                satisfied=not bool(current_reserved_by),
                message="Target is not reserved." if not current_reserved_by else f"Target is reserved by {current_reserved_by}.",
            ),
        ])

        nonce = self._windchill.get_csrf_nonce_status()
        checks.append(ReadinessCheck(
            name="CSRF_NONCE_AVAILABLE",
            satisfied=nonce.get("nonce_present") is True,
            message="CSRF nonce is available. Token value is not exposed.",
        ))

        result = self._result(
            request,
            checks,
            {
                "native_id": current.get("ID"),
                "number": current.get("Number"),
                "version_id": current_version,
                "last_modified": current_modified,
                "description": current_description,
                "reserved_by": current_reserved_by,
                "state": state.get("Value") if isinstance(state, dict) else None,
            },
            [
                "DRY_RUN_ONLY: no reservation or enterprise write was performed.",
                "Modification permission is not yet verified.",
            ],
        )
        self._audit.append(AuditEvent(
            event_type="EXECUTION_READINESS_CHECKED",
            actor=request.requested_by,
            action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash,
            approval_id=request.approval_id,
            metadata={
                "ready_for_execution": result.ready_for_execution,
                "dry_run_only": True,
                "checks": [check.model_dump(mode="json") for check in checks],
            },
        ))
        return result

    @staticmethod
    def _result(request, checks, snapshot, warnings) -> ExecutionReadinessResult:
        all_checks_pass = all(check.satisfied or not check.blocking for check in checks)
        return ExecutionReadinessResult(
            readiness_id=f"readiness:{uuid4()}",
            action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash,
            approval_id=request.approval_id,
            checked_at=datetime.now(timezone.utc),
            checks=checks,
            # Deliberately false in v0.5 even if all dry-run checks pass.
            ready_for_execution=False,
            dry_run_only=True,
            target_snapshot=snapshot,
            warnings=warnings + (["All dry-run checks passed."] if all_checks_pass else ["One or more blocking checks failed."]),
        )
