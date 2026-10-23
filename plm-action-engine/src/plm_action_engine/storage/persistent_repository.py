from __future__ import annotations

from plm_action_engine.contracts import ActionPreview, ApprovalRecord, ChangeTaskDescriptionExecutionResult

from .json_file_store import JsonFileStore


class JsonPreviewRepository:
    def __init__(self, store: JsonFileStore) -> None:
        self._store = store

    def save(self, preview: ActionPreview) -> ActionPreview:
        self._store.put(preview.action_plan_id, preview.model_dump(mode="json"))
        return preview

    def get(self, action_plan_id: str) -> ActionPreview | None:
        value = self._store.get(action_plan_id)
        return ActionPreview.model_validate(value) if value else None


class JsonApprovalRepository:
    def __init__(self, store: JsonFileStore) -> None:
        self._store = store

    def save(self, record: ApprovalRecord) -> ApprovalRecord:
        self._store.put(record.approval_id, record.model_dump(mode="json"))
        return record

    def get(self, approval_id: str) -> ApprovalRecord | None:
        value = self._store.get(approval_id)
        return ApprovalRecord.model_validate(value) if value else None

    def find_by_plan(self, action_plan_id: str, plan_hash: str) -> ApprovalRecord | None:
        for value in self._store.values():
            record = ApprovalRecord.model_validate(value)
            if record.action_plan_id == action_plan_id and record.plan_hash == plan_hash:
                return record
        return None


class JsonExecutionRepository:
    def __init__(self, store: JsonFileStore) -> None:
        self._store = store

    def save(self, result: ChangeTaskDescriptionExecutionResult) -> ChangeTaskDescriptionExecutionResult:
        self._store.put(result.execution_id, result.model_dump(mode="json"))
        return result

    def get(self, execution_id: str) -> ChangeTaskDescriptionExecutionResult | None:
        value = self._store.get(execution_id)
        return ChangeTaskDescriptionExecutionResult.model_validate(value) if value else None

    def find_by_idempotency_key(self, key: str) -> ChangeTaskDescriptionExecutionResult | None:
        for value in self._store.values():
            result = ChangeTaskDescriptionExecutionResult.model_validate(value)
            if result.idempotency_key == key:
                return result
        return None
