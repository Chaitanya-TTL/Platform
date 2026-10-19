from types import SimpleNamespace
import pytest
from codebeamer_extractor.enrichment import CodebeamerEnrichmentService
from codebeamer_extractor.models import AttachmentsResponse, RelationsResponse, TrackerItem

class FakeClient:
    async def get_item(self, item_id): return TrackerItem(id=item_id, name="Dynamic requirement")
    async def get_relations(self, item_id): return RelationsResponse(itemId={"id": item_id}, itemCount=0, isLastPage=True)
    async def get_attachments(self, item_id): return AttachmentsResponse(total=0, attachments=[])

@pytest.mark.asyncio
async def test_enrichment_marks_loaded_empty_collections():
    value = await CodebeamerEnrichmentService(FakeClient()).enrich(42)
    assert value.contractVersion == "2.0"
    assert value.status == "complete"
    assert value.item.status == "loaded"
    assert value.relations.status == "loaded-empty"
    assert value.attachments.status == "loaded-empty"

@pytest.mark.asyncio
async def test_enrichment_honours_not_requested():
    value = await CodebeamerEnrichmentService(FakeClient()).enrich(42, include_relations=False, include_attachments=False)
    assert value.relations.status == "not-requested"
    assert value.attachments.status == "not-requested"
