from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from plm_action_engine.audit import AuditEvent, AuditRepository
from plm_action_engine.approval import ApprovalService
from plm_action_engine.clients import WindchillClient, WindchillClientError
from plm_action_engine.contracts import (
    ReservationRoundTripRequest,
    ReservationRoundTripResult,
    ReservationStep,
)
from plm_action_engine.storage import ApprovalRepository, PreviewRepository


_CHANGE_NOTICE_OID_PATTERN = re.compile(r"ChangeNotices\('([^']+)'\)")


class ReservationRoundTripService:
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

    def execute(self, request: ReservationRoundTripRequest) -> ReservationRoundTripResult:
        started = datetime.now(timezone.utc)
        execution_id = f"reservation:{uuid4()}"
        steps: list[ReservationStep] = []
        task_reserved = False
        notice_reserved = False
        cleanup_complete = False
        status = "FAILED"

        preview = self._previews.get(request.action_plan_id)
        approval = self._approvals.get(request.approval_id)
        if preview is None:
            raise ValueError("Stored preview not found")
        if approval is None:
            raise ValueError("Stored approval not found")
        if preview.tool_name != "windchill.update_change_task_description":
            raise ValueError("Reservation round-trip is restricted to the Change Task description tool")
        if preview.plan_hash != request.plan_hash or approval.plan_hash != request.plan_hash:
            raise ValueError("Plan hash mismatch")
        validation = self._approval_service.validate(request.action_plan_id, request.plan_hash)
        if not validation.valid or validation.approval_id != request.approval_id:
            raise ValueError("Approval is invalid, expired, or does not match the request")

        task_oid = preview.target.native_id
        if not task_oid:
            raise ValueError("Preview has no Change Task OID")
        task_before = self._windchill.get_change_task_by_oid(task_oid)
        if not task_before:
            raise ValueError("Change Task no longer exists")
        if task_before.get("ReservedBy"):
            raise ValueError(f"Change Task is already reserved by {task_before.get('ReservedBy')}")
        if task_before.get("VersionID") != preview.target.expected_version:
            raise ValueError("Change Task version changed after approval")
        if task_before.get("LastModified") != (
            preview.target.expected_last_modified.isoformat()
            if preview.target.expected_last_modified else None
        ):
            raise ValueError("Change Task LastModified changed after approval")
        if task_before.get("Description") != preview.current_values.get("description"):
            raise ValueError("Change Task description changed after approval")

        notice_oid = self._extract_notice_oid(task_before)
        notice_before = self._windchill.get_change_notice_by_oid(notice_oid)
        if not notice_before:
            raise ValueError("Related Change Notice no longer exists")
        if notice_before.get("ReservedBy"):
            raise ValueError(f"Change Notice is already reserved by {notice_before.get('ReservedBy')}")

        self._audit.append(AuditEvent(
            event_type="RESERVATION_ROUND_TRIP_STARTED",
            actor=request.requested_by,
            action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash,
            approval_id=request.approval_id,
            metadata={
                "execution_id": execution_id,
                "change_notice_oid": notice_oid,
                "change_task_oid": task_oid,
                "description_modified": False,
            },
        ))

        try:
            self._windchill.reserve_change_notice(notice_oid, request.duration)
            notice_reserved = True
            steps.append(ReservationStep(
                name="RESERVE_CHANGE_NOTICE", status="SUCCESS",
                message="Change Notice reserve action completed."
            ))
            notice_during = self._windchill.get_change_notice_by_oid(notice_oid) or {}
            if not notice_during.get("ReservedBy"):
                raise WindchillClientError("Change Notice reservation was not visible on read-back")
            steps.append(ReservationStep(
                name="VERIFY_CHANGE_NOTICE_RESERVED", status="SUCCESS",
                message="Change Notice read-back shows a reservation."
            ))

            self._windchill.reserve_change_task(task_oid, request.duration)
            task_reserved = True
            steps.append(ReservationStep(
                name="RESERVE_CHANGE_TASK", status="SUCCESS",
                message="Change Task reserve action completed."
            ))
            task_during = self._windchill.get_change_task_by_oid(task_oid) or {}
            if not task_during.get("ReservedBy"):
                raise WindchillClientError("Change Task reservation was not visible on read-back")
            steps.append(ReservationStep(
                name="VERIFY_CHANGE_TASK_RESERVED", status="SUCCESS",
                message="Change Task read-back shows a reservation."
            ))
            status = "RESERVED_AND_VERIFIED"
        except Exception as exc:
            steps.append(ReservationStep(
                name="ROUND_TRIP_OPERATION", status="FAILED", message=str(exc)
            ))
        finally:
            if task_reserved:
                try:
                    self._windchill.undo_change_task_reservation(task_oid, request.duration)
                    steps.append(ReservationStep(
                        name="UNRESERVE_CHANGE_TASK", status="SUCCESS",
                        message="Change Task reservation cleanup completed."
                    ))
                except Exception as exc:
                    steps.append(ReservationStep(
                        name="UNRESERVE_CHANGE_TASK", status="FAILED", message=str(exc)
                    ))
            if notice_reserved:
                try:
                    self._windchill.undo_change_notice_reservation(notice_oid, request.duration)
                    steps.append(ReservationStep(
                        name="UNRESERVE_CHANGE_NOTICE", status="SUCCESS",
                        message="Change Notice reservation cleanup completed."
                    ))
                except Exception as exc:
                    steps.append(ReservationStep(
                        name="UNRESERVE_CHANGE_NOTICE", status="FAILED", message=str(exc)
                    ))

            task_after = self._windchill.get_change_task_by_oid(task_oid) or {}
            notice_after = self._windchill.get_change_notice_by_oid(notice_oid) or {}
            cleanup_complete = not task_after.get("ReservedBy") and not notice_after.get("ReservedBy")
            steps.append(ReservationStep(
                name="VERIFY_CLEANUP",
                status="SUCCESS" if cleanup_complete else "FAILED",
                message=(
                    "Both reservations are cleared."
                    if cleanup_complete else "One or more reservations remain."
                ),
            ))
            if status == "RESERVED_AND_VERIFIED" and cleanup_complete:
                status = "VERIFIED_SUCCESS"
            elif not cleanup_complete:
                status = "MANUAL_CLEANUP_REQUIRED"

        completed = datetime.now(timezone.utc)
        result = ReservationRoundTripResult(
            execution_id=execution_id,
            action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash,
            approval_id=request.approval_id,
            started_at=started,
            completed_at=completed,
            status=status,
            change_notice_oid=notice_oid,
            change_task_oid=task_oid,
            steps=steps,
            cleanup_complete=cleanup_complete,
            description_modified=False,
            warnings=[
                "Reservation state was temporarily changed in Windchill.",
                "No Change Task description or business attribute was modified.",
            ],
        )
        self._audit.append(AuditEvent(
            event_type="RESERVATION_ROUND_TRIP_COMPLETED",
            actor=request.requested_by,
            action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash,
            approval_id=request.approval_id,
            metadata=result.model_dump(mode="json"),
        ))
        return result

    @staticmethod
    def _extract_notice_oid(task: dict) -> str:
        reference = task.get("ChangeNoticeReference") or {}
        resource_id = reference.get("ResourceID") if isinstance(reference, dict) else None
        if not resource_id:
            raise ValueError("Change Task has no Change Notice reference")
        match = _CHANGE_NOTICE_OID_PATTERN.search(str(resource_id))
        if not match:
            raise ValueError("Unable to parse Change Notice OID from reference")
        return match.group(1)
