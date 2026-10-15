import httpx, pytest
from codebeamer_extractor.client import CodebeamerClient
from codebeamer_extractor.config import CodebeamerConfig
from codebeamer_extractor.diagnostics import CodebeamerPermissionError, CodebeamerContractError

def cfg(): return CodebeamerConfig(base_url="https://cb.example",instance_key="primary",username="user",password="pw")
@pytest.mark.asyncio
async def test_lists_projects_and_uses_api_route():
    async def handler(request):
        assert request.url.path=="/cb/api/v3/projects"; return httpx.Response(200,json=[{"id":9,"name":"Steering Requirements","type":"ProjectReference"}])
    async with CodebeamerClient(cfg(),httpx.MockTransport(handler)) as client:
        projects=await client.list_projects(); assert projects[0].id==9
@pytest.mark.asyncio
async def test_queries_items_with_verified_tracker_filter():
    async def handler(request):
        assert request.url.params["queryString"]=="tracker.id=9734"; assert request.url.params["page"]=="2"
        return httpx.Response(200,json={"page":2,"pageSize":25,"total":1,"items":[]})
    async with CodebeamerClient(cfg(),httpx.MockTransport(handler)) as client: assert (await client.query_tracker_items(9734,2,25)).page==2
@pytest.mark.asyncio
async def test_classifies_permission_error():
    async def handler(request): return httpx.Response(403,json={"message":"denied"})
    async with CodebeamerClient(cfg(),httpx.MockTransport(handler)) as client:
        with pytest.raises(CodebeamerPermissionError): await client.list_projects()
@pytest.mark.asyncio
async def test_rejects_malformed_json():
    async def handler(request): return httpx.Response(200,text="not-json")
    async with CodebeamerClient(cfg(),httpx.MockTransport(handler)) as client:
        with pytest.raises(CodebeamerContractError): await client.list_projects()
