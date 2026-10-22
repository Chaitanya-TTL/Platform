from typing import Protocol

from plm_action_engine.contracts import ApprovalRecord


class ApprovalRepository(Protocol):
    def save(self, record: ApprovalRecord) -> ApprovalRecord:
        ...

    def get(self, approval_id: str) -> ApprovalRecord | None:
        ...

    def find_by_plan(self, action_plan_id: str, plan_hash: str) -> ApprovalRecord | None:
        ...


class InMemoryApprovalRepository:
    def __init__(self) -> None:
        self._records: dict[str, ApprovalRecord] = {}

    def save(self, record: ApprovalRecord) -> ApprovalRecord:
        self._records[record.approval_id] = record
        return record

    def get(self, approval_id: str) -> ApprovalRecord | None:
        return self._records.get(approval_id)

    def find_by_plan(self, action_plan_id: str, plan_hash: str) -> ApprovalRecord | None:
        for record in self._records.values():
            if record.action_plan_id == action_plan_id and record.plan_hash == plan_hash:
                return record
        return None
