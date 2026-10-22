from typing import Protocol

from plm_action_engine.contracts import ActionPreview


class PreviewRepository(Protocol):
    def save(self, preview: ActionPreview) -> ActionPreview:
        ...

    def get(self, action_plan_id: str) -> ActionPreview | None:
        ...


class InMemoryPreviewRepository:
    def __init__(self) -> None:
        self._records: dict[str, ActionPreview] = {}

    def save(self, preview: ActionPreview) -> ActionPreview:
        self._records[preview.action_plan_id] = preview
        return preview

    def get(self, action_plan_id: str) -> ActionPreview | None:
        return self._records.get(action_plan_id)
