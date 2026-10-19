from codebeamer_extractor.hierarchy import build_hierarchy
from codebeamer_extractor.models import NormalizedRequirement
def req(id,parent=None,children=[]):return NormalizedRequirement(source_instance="primary",canonical_id=f"codebeamer:primary:item:{id}",project_id=1,project_name="P",tracker_id=2,tracker_name="T",tracker_type="Requirement",item_id=id,external_key=str(id),name=str(id),parent_id=parent,child_ids=children,synchronized_at="now")
def test_deduplicates_bidirectional_hierarchy_evidence():
    edges,duplicates=build_hierarchy([req(1,children=[2]),req(2,parent=1)]);assert len(edges)==1 and duplicates==1 and edges[0].relationship=="parent-of"
