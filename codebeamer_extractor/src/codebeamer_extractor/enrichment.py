"""Universal live item enrichment with independent optional evidence states."""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Awaitable, Callable, TypeVar
from .diagnostics import CodebeamerError
from .models import (
    AttachmentsResponse,
    EnrichmentSection,
    ItemEnrichmentV2,
    RelationsResponse,
    SourceFailure,
    TrackerItem,
)

T = TypeVar("T")

class CodebeamerEnrichmentService:
    def __init__(self, client):
        self.client = client

    async def enrich(self, item_id: int, *, include_relations: bool = True, include_attachments: bool = True) -> ItemEnrichmentV2:
        retrieved_at = _now()
        item = await self.client.get_item(item_id)
        item_section = EnrichmentSection(status="loaded", retrievedAt=retrieved_at, count=1, data=item)

        relations_task = self._optional("item-relations", self.client.get_relations(item_id)) if include_relations else None
        attachments_task = self._optional("item-attachments", self.client.get_attachments(item_id)) if include_attachments else None
        pending = [task for task in (relations_task, attachments_task) if task is not None]
        completed = await asyncio.gather(*pending) if pending else []
        cursor = iter(completed)

        relations = next(cursor) if include_relations else EnrichmentSection(status="not-requested")
        attachments = next(cursor) if include_attachments else EnrichmentSection(status="not-requested")
        failures = [failure for section in (relations, attachments) for failure in section.failures]
        overall = "complete" if not failures else "partial-success"
        return ItemEnrichmentV2(status=overall, item=item_section, relations=relations, attachments=attachments, failures=failures, retrievedAt=retrieved_at)

    async def _optional(self, stage: str, operation: Awaitable[T]) -> EnrichmentSection:
        try:
            data = await operation
            count = _count(data)
            return EnrichmentSection(status="loaded-empty" if count == 0 else "loaded", retrievedAt=_now(), count=count, data=data)
        except CodebeamerError as exc:
            failure = exc.failure(stage)
            return EnrichmentSection(status="failed", retrievedAt=_now(), failures=[failure])
        except Exception as exc:
            failure = SourceFailure(stage=stage, classification="unexpected", message=str(exc), retryable=False)
            return EnrichmentSection(status="failed", retrievedAt=_now(), failures=[failure])

def _count(value: object) -> int:
    if isinstance(value, RelationsResponse): return value.itemCount
    if isinstance(value, AttachmentsResponse): return value.total
    return 1

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
