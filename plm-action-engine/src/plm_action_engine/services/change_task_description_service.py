from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from plm_action_engine.audit import AuditEvent, AuditRepository
from plm_action_engine.approval import ApprovalService
from plm_action_engine.clients import WindchillClient, WindchillClientError
from plm_action_engine.contracts import (
    ChangeTaskDescriptionExecutionRequest,
    ChangeTaskDescriptionExecutionResult,
    ExecutionStep,
)
from plm_action_engine.storage import ApprovalRepository, PreviewRepository, ExecutionRepository, InMemoryExecutionRepository

_CHANGE_NOTICE_OID_PATTERN = re.compile(r"ChangeNotices\('([^']+)'\)")


class ChangeTaskDescriptionExecutionService:
    TOOL_NAME = "windchill.update_change_task_description"

    def __init__(self, previews: PreviewRepository, approvals: ApprovalRepository,
                 approval_service: ApprovalService, windchill: WindchillClient,
                 audit: AuditRepository, executions: ExecutionRepository | None = None) -> None:
        self._previews = previews
        self._approvals = approvals
        self._approval_service = approval_service
        self._windchill = windchill
        self._audit = audit
        self._executions = executions or InMemoryExecutionRepository()

    def execute(self, request: ChangeTaskDescriptionExecutionRequest) -> ChangeTaskDescriptionExecutionResult:
        existing = self._executions.find_by_idempotency_key(request.idempotency_key)
        if existing is not None:
            if (existing.action_plan_id != request.action_plan_id or existing.plan_hash != request.plan_hash
                    or existing.approval_id != request.approval_id):
                raise ValueError("Idempotency key is already associated with a different approved plan")
            return existing
        if not self._windchill.writes_enabled:
            raise ValueError("Windchill writes are disabled by server configuration")

        preview = self._previews.get(request.action_plan_id)
        if preview is None:
            raise ValueError("Stored preview not found")
        approval = self._approvals.get(request.approval_id)
        if approval is None:
            raise ValueError("Stored approval not found")
        if approval.consumed_at is not None or approval.consumed_by_execution_id is not None:
            raise ValueError("Approval has already been consumed")
        if preview.tool_name != self.TOOL_NAME:
            raise ValueError("Unsupported tool for Change Task Description execution")
        if approval.approval_id != request.approval_id:
            raise ValueError("Approval ID mismatch")
        if preview.plan_hash != request.plan_hash or approval.plan_hash != request.plan_hash:
            raise ValueError("Plan hash mismatch")
        validation = self._approval_service.validate(request.action_plan_id, request.plan_hash)
        if not validation.valid:
            raise ValueError("Approval is invalid: " + "; ".join(validation.errors))
        if validation.approval_id != request.approval_id:
            raise ValueError("Approval ID mismatch")
        if set(preview.proposed_values) != {"description"}:
            raise ValueError("Proposed values must contain exactly one field: description")
        requested_description = preview.proposed_values["description"]
        if not isinstance(requested_description, str) or not requested_description.strip():
            raise ValueError("Approved description must be a non-empty string")

        started = datetime.now(timezone.utc)
        execution_id = f"execution:{uuid4()}"
        task_oid = preview.target.native_id
        previous_description = preview.current_values.get("description")
        steps: list[ExecutionStep] = []
        warnings: list[str] = []
        notice_oid = ""
        task_reserved = False
        notice_reserved = False
        cleanup_complete = False
        description_modified = False
        verified_description = None
        status = "FAILED"
        current_step = "PRE_EXECUTION_REVALIDATION"
        failed_step = None
        failure_message = None

        approval.consumed_at = started
        approval.consumed_by_execution_id = execution_id
        self._approvals.save(approval)

        self._audit.append(AuditEvent(
            event_type="CHANGE_TASK_DESCRIPTION_EXECUTION_STARTED",
            actor=request.requested_by, action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash, approval_id=request.approval_id,
            metadata={"execution_id": execution_id, "change_task_oid": task_oid,
                      "previous_description": previous_description,
                      "requested_description": requested_description},
        ))

        try:
            current_step = "PRE_EXECUTION_REVALIDATION"
            task = self._windchill.get_change_task_by_oid(task_oid)
            if task is None or task.get("ID") != task_oid:
                raise ValueError("Change Task OID no longer matches the preview")
            expected_version = preview.current_values.get("version_id") or preview.current_values.get("VersionID")
            expected_modified = preview.current_values.get("last_modified") or preview.current_values.get("LastModified")
            if expected_version is not None and task.get("VersionID") != expected_version:
                raise ValueError("Change Task VersionID changed after preview")
            if expected_modified is not None and str(task.get("LastModified")) != str(expected_modified):
                raise ValueError("Change Task LastModified changed after preview")
            if task.get("Description") != previous_description:
                raise ValueError("Change Task Description changed after preview")
            if task.get("ReservedBy"):
                raise ValueError("Change Task is already reserved")

            notice_oid = self._extract_notice_oid(task)
            notice = self._windchill.get_change_notice_by_oid(notice_oid)
            if notice is None:
                raise ValueError("Related Change Notice was not found")
            if notice.get("ReservedBy"):
                raise ValueError("Change Notice is already reserved")

            current_step = "RESERVE_CHANGE_NOTICE"
            self._windchill.reserve_change_notice(notice_oid, request.duration)
            notice_reserved = True
            steps.append(ExecutionStep(name="RESERVE_CHANGE_NOTICE", status="SUCCESS", message="Change Notice reservation requested."))
            current_step = "VERIFY_CHANGE_NOTICE_RESERVED"
            notice = self._windchill.get_change_notice_by_oid(notice_oid)
            if not notice or not notice.get("ReservedBy"):
                raise WindchillClientError("Change Notice reservation read-back failed")
            steps.append(ExecutionStep(name="VERIFY_CHANGE_NOTICE_RESERVED", status="SUCCESS", message="Change Notice reservation verified."))

            current_step = "RESERVE_CHANGE_TASK"
            self._windchill.reserve_change_task(task_oid, request.duration)
            task_reserved = True
            steps.append(ExecutionStep(name="RESERVE_CHANGE_TASK", status="SUCCESS", message="Change Task reservation requested."))
            current_step = "VERIFY_CHANGE_TASK_RESERVED"
            task = self._windchill.get_change_task_by_oid(task_oid)
            if not task or not task.get("ReservedBy"):
                raise WindchillClientError("Change Task reservation read-back failed")
            steps.append(ExecutionStep(name="VERIFY_CHANGE_TASK_RESERVED", status="SUCCESS", message="Change Task reservation verified."))

            current_step = "PATCH_CHANGE_TASK_DESCRIPTION"
            self._windchill.patch_change_task_description(task_oid, requested_description)
            steps.append(ExecutionStep(name="PATCH_CHANGE_TASK_DESCRIPTION", status="SUCCESS", message="Description PATCH accepted."))
            current_step = "VERIFY_DESCRIPTION"
            observed = self._windchill.get_change_task_by_oid(task_oid)
            verified_description = observed.get("Description") if observed else None
            if verified_description != requested_description:
                steps.append(ExecutionStep(name="VERIFY_DESCRIPTION", status="FAILED", message="Description read-back did not match the approved value."))
                raise WindchillClientError("Description read-back mismatch")
            description_modified = True
            steps.append(ExecutionStep(name="VERIFY_DESCRIPTION", status="SUCCESS", message="Exact description read-back verified."))
            status = "VERIFIED_SUCCESS"
        except (ValueError, WindchillClientError) as exc:
            failure_message = str(exc)
            failed_step = current_step
            warnings.append(failure_message)
            status = "FAILED"
        finally:
            if task_reserved:
                try:
                    self._windchill.undo_change_task_reservation(task_oid, request.duration)
                    steps.append(ExecutionStep(name="UNRESERVE_CHANGE_TASK", status="SUCCESS", message="Change Task reservation released."))
                except WindchillClientError as exc:
                    steps.append(ExecutionStep(name="UNRESERVE_CHANGE_TASK", status="FAILED", message=str(exc)))
                    warnings.append(str(exc))
            if notice_reserved:
                try:
                    self._windchill.undo_change_notice_reservation(notice_oid, request.duration)
                    steps.append(ExecutionStep(name="UNRESERVE_CHANGE_NOTICE", status="SUCCESS", message="Change Notice reservation released."))
                except WindchillClientError as exc:
                    steps.append(ExecutionStep(name="UNRESERVE_CHANGE_NOTICE", status="FAILED", message=str(exc)))
                    warnings.append(str(exc))
            try:
                final_task = self._windchill.get_change_task_by_oid(task_oid)
                final_notice = self._windchill.get_change_notice_by_oid(notice_oid) if notice_oid else None
                cleanup_complete = bool(final_task is not None and not final_task.get("ReservedBy") and
                                        final_notice is not None and not final_notice.get("ReservedBy"))
            except WindchillClientError as exc:
                cleanup_complete = False
                warnings.append(str(exc))
            steps.append(ExecutionStep(name="VERIFY_CLEANUP", status="SUCCESS" if cleanup_complete else "FAILED",
                                       message="Both reservations are cleared." if cleanup_complete else "One or more reservations remain."))
            if not cleanup_complete:
                status = "MANUAL_CLEANUP_REQUIRED"

        result = ChangeTaskDescriptionExecutionResult(
            execution_id=execution_id, action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash, approval_id=request.approval_id,
            started_at=started, completed_at=datetime.now(timezone.utc), status=status,
            change_notice_oid=notice_oid, change_task_oid=task_oid,
            previous_description=previous_description, requested_description=requested_description,
            verified_description=verified_description, description_modified=description_modified,
            cleanup_complete=cleanup_complete, steps=steps, warnings=warnings,
            idempotency_key=request.idempotency_key, failed_step=failed_step,
            failure_message=failure_message,
        )
        self._executions.save(result)
        self._audit.append(AuditEvent(
            event_type="CHANGE_TASK_DESCRIPTION_EXECUTION_COMPLETED",
            actor=request.requested_by, action_plan_id=request.action_plan_id,
            plan_hash=request.plan_hash, approval_id=request.approval_id,
            metadata=result.model_dump(mode="json"),
        ))
        return result

    @staticmethod
    def _extract_notice_oid(task: dict) -> str:
        reference = task.get("ChangeNoticeReference") or {}
        resource_id = reference.get("ResourceID") if isinstance(reference, dict) else None
        match = _CHANGE_NOTICE_OID_PATTERN.search(str(resource_id or ""))
        if not match:
            raise ValueError("Unable to parse Change Notice OID from reference")
        return match.group(1)
