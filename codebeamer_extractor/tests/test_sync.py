import pytest
from codebeamer_extractor.models import *
from codebeamer_extractor.storage import FileCatalogRepository
from codebeamer_extractor.sync import CodebeamerSyncCoordinator
def descriptor():return RequirementTrackerDescriptor(project_id=1,project_name="P",tracker_id=2,tracker_name="T",tracker_type="Requirement")
class Extractor:
    async def extract_all(self,discoverer=None):return ExtractionResult(instance_key="primary",trackers=[TrackerExtraction(tracker=descriptor(),items=[TrackerItem(id=1,name="Root",children=[{"id":2,"name":"Child"}]),TrackerItem(id=2,name="Child",parent={"id":1,"name":"Root"})],complete=True)])
@pytest.mark.asyncio
async def test_sync_maps_persists_and_deduplicates(tmp_path):
    repo=FileCatalogRepository(tmp_path);snapshot=await CodebeamerSyncCoordinator(Extractor(),repo).synchronize();assert snapshot.status=="complete" and len(snapshot.requirements)==2 and len(snapshot.hierarchy)==1 and snapshot.duplicate_hierarchy_edges_removed==1 and repo.load_sync_state().requirement_count==2
