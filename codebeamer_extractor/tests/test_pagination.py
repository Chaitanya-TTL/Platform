import pytest
from codebeamer_extractor.config import CodebeamerConfig
from codebeamer_extractor.extractor import CodebeamerRequirementExtractor
from codebeamer_extractor.models import *

def cfg(**kw):
    d=dict(base_url="https://cb.example",instance_key="primary",username="u",password="p",page_size=25,max_pages=10);d.update(kw);return CodebeamerConfig(**d)
def desc(): return RequirementTrackerDescriptor(project_id=1,project_name="Generic",tracker_id=10,tracker_name="Product Needs",tracker_type="Requirement")
class Paging:
    def __init__(self,repeated=False): self.calls=[];self.repeated=repeated
    async def query_tracker_items(self,tracker_id,page,page_size):
        self.calls.append(page); start=0 if self.repeated else (page-1)*25; count=25 if page<3 else 13
        return TrackerItemPage(page=page,pageSize=25,total=63,items=[TrackerItem(id=i+1,name=f"R{i+1}") for i in range(start,start+count)])
@pytest.mark.asyncio
async def test_extracts_63_items_across_three_pages():
    client=Paging(); result=await CodebeamerRequirementExtractor(client,cfg()).extract_tracker(desc())
    assert result.complete and len(result.items)==63 and client.calls==[1,2,3]
@pytest.mark.asyncio
async def test_detects_repeated_page():
    result=await CodebeamerRequirementExtractor(Paging(repeated=True),cfg()).extract_tracker(desc())
    assert not result.complete and result.failure and result.failure.classification=="pagination"
class Empty:
    async def query_tracker_items(self,*_): return TrackerItemPage(page=1,pageSize=25,total=0,items=[])
@pytest.mark.asyncio
async def test_empty_tracker_completes():
    result=await CodebeamerRequirementExtractor(Empty(),cfg()).extract_tracker(desc()); assert result.complete and result.items==[]
