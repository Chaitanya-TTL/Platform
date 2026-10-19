"""Deterministic requirement hierarchy construction."""
from .mapper import canonical_item_id
from .models import HierarchyEdge,NormalizedRequirement
def hierarchy_edge_id(instance_key:str,parent_id:int,child_id:int)->str:return f"codebeamer:{instance_key}:hierarchy:{parent_id}:{child_id}"
def build_hierarchy(requirements:list[NormalizedRequirement])->tuple[list[HierarchyEdge],int]:
    pairs=[]; by_id={r.item_id:r for r in requirements}; instance=requirements[0].source_instance if requirements else "unknown"
    for item in requirements:
        if item.parent_id is not None:pairs.append((item.parent_id,item.item_id))
        pairs.extend((item.item_id,child) for child in item.child_ids)
    unique=sorted(set(pairs)); duplicates=len(pairs)-len(unique)
    return [HierarchyEdge(id=hierarchy_edge_id(instance,p,c),source=canonical_item_id(instance,p),target=canonical_item_id(instance,c),parent_id=p,child_id=c,unresolved_parent=p not in by_id,unresolved_child=c not in by_id) for p,c in unique if p!=c],duplicates
