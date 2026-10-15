import pytest
from codebeamer_extractor.diagnostics import CodebeamerPermissionError
from codebeamer_extractor.enrichment import CodebeamerEnrichmentService
from codebeamer_extractor.models import AttachmentsResponse,RelationsResponse,TrackerItem
class Client:
    async def get_item(self,id):return TrackerItem(id=id,name="Requirement")
    async def get_relations(self,id):return RelationsResponse(itemCount=0)
    async def get_attachments(self,id):raise CodebeamerPermissionError("denied",operation="get-attachments",source_id=str(id),http_status=403)
@pytest.mark.asyncio
async def test_enrichment_preserves_item_and_isolates_optional_failures():
    result=await CodebeamerEnrichmentService(Client()).enrich(7);assert result.item.id==7 and result.relations is not None and result.attachments is None and len(result.failures)==1 and result.failures[0].classification=="permission"
