import pytest
from codebeamer_extractor.config import CodebeamerConfig
from codebeamer_extractor.discovery import CodebeamerCatalogDiscoverer, is_requirement_tracker
from codebeamer_extractor.models import *
from codebeamer_extractor.diagnostics import CodebeamerPermissionError

def cfg(**kw):
    d=dict(base_url="https://cb.example",instance_key="primary",username="u",password="p");d.update(kw);return CodebeamerConfig(**d)
def tracker(name="Product Needs",type_name="Requirement",hidden=False,deleted=False): return TrackerMetadata(id=10,name=name,type=TrackerTypeReference(id=5,name=type_name),project=ProjectReference(id=1,name="Generic"),hidden=hidden,deleted=deleted)
def test_classifies_by_type_not_name(): assert is_requirement_tracker(tracker())
def test_rejects_task_even_if_name_contains_requirement(): assert not is_requirement_tracker(tracker("Requirements Discussion Tasks","Task"))
def test_rejects_hidden_or_deleted(): assert not is_requirement_tracker(tracker(hidden=True)) and not is_requirement_tracker(tracker(deleted=True))
class Fake:
    async def list_projects(self): return [ProjectReference(id=1,name="Good"),ProjectReference(id=2,name="Denied")]
    async def list_project_trackers(self,id):
        if id==2: raise CodebeamerPermissionError("denied",operation="list-project-trackers",source_id="2",http_status=403)
        return [TrackerReference(id=10,name="Product Needs"),TrackerReference(id=11,name="Requirements Tasks")]
    async def get_tracker(self,id): return tracker() if id==10 else tracker("Requirements Tasks","Task")
@pytest.mark.asyncio
async def test_partial_project_failure_preserves_success():
    result=await CodebeamerCatalogDiscoverer(Fake(),cfg()).discover()
    assert len(result.requirement_trackers)==1; assert len(result.failures)==1; assert result.failures[0].classification=="permission"
