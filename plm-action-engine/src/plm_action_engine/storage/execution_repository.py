from typing import Protocol
from plm_action_engine.contracts import ChangeTaskDescriptionExecutionResult

class ExecutionRepository(Protocol):
    def save(self, result: ChangeTaskDescriptionExecutionResult) -> ChangeTaskDescriptionExecutionResult: ...
    def get(self, execution_id: str) -> ChangeTaskDescriptionExecutionResult | None: ...
    def find_by_idempotency_key(self, key: str) -> ChangeTaskDescriptionExecutionResult | None: ...

class InMemoryExecutionRepository:
    def __init__(self) -> None: self._records = {}
    def save(self, result): self._records[result.execution_id] = result; return result
    def get(self, execution_id): return self._records.get(execution_id)
    def find_by_idempotency_key(self, key):
        return next((r for r in self._records.values() if r.idempotency_key == key), None)
