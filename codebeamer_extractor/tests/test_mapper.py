from codebeamer_extractor.mapper import map_requirement
from codebeamer_extractor.models import *
def test_maps_collision_safe_identity_and_cleans_text():
    item=TrackerItem(id=1190,name="SR-001  Steering Material",description="The component shall use &lt;b&gt;Mild Steel&lt;/b&gt;.",status={"id":1,"name":"New"},parent={"id":1187,"name":"Root"})
    tracker=RequirementTrackerDescriptor(project_id=9,project_name="Steering",tracker_id=9734,tracker_name="CRS",tracker_key="CRS",tracker_type="Requirement")
    mapped=map_requirement(item,tracker,"primary","2026-01-01T00:00:00Z")
    assert mapped.canonical_id=="codebeamer:primary:item:1190" and mapped.external_key=="CRS-1190" and "Mild Steel" in mapped.description and mapped.parent_id==1187
