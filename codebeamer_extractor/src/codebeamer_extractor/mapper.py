"""Map Codebeamer items into stable normalized requirement documents."""
from __future__ import annotations
import html,re
from datetime import datetime,timezone
from typing import Any
from .models import NormalizedRequirement,RequirementTrackerDescriptor,TrackerItem
_TAG_RE=re.compile(r"<[^>]+>"); _WIKI_RE=re.compile(r"(?:\[\[|\]\]|\{\{|\}\}|''+)"); _WS_RE=re.compile(r"\s+")
def clean_text(value:str|None)->str:
    if not value:return ""
    return _WS_RE.sub(" ",_WIKI_RE.sub(" ",_TAG_RE.sub(" ",html.unescape(value)))).strip()
def canonical_item_id(instance_key:str,item_id:int)->str:return f"codebeamer:{instance_key}:item:{item_id}"
def _names(values:list[Any])->list[str]:return [clean_text(getattr(v,"name",None)) for v in values if clean_text(getattr(v,"name",None))]
def _custom(values:list[Any])->dict[str,str|int|float|bool]:
    out={}
    for value in values[:50]:
        if hasattr(value,"model_dump"):value=value.model_dump()
        if not isinstance(value,dict):continue
        key=str(value.get("name") or value.get("fieldName") or value.get("id") or "").strip(); raw=value.get("value")
        if key and isinstance(raw,(str,int,float,bool)):out[key]=clean_text(raw) if isinstance(raw,str) else raw
    return out
def map_requirement(item:TrackerItem,tracker:RequirementTrackerDescriptor,instance_key:str,synchronized_at:str|None=None)->NormalizedRequirement:
    synchronized_at=synchronized_at or datetime.now(timezone.utc).isoformat()
    return NormalizedRequirement(source_instance=instance_key,canonical_id=canonical_item_id(instance_key,item.id),project_id=tracker.project_id,project_name=clean_text(tracker.project_name),tracker_id=tracker.tracker_id,tracker_name=clean_text(tracker.tracker_name),tracker_type=tracker.tracker_type,item_id=item.id,external_key=f"{tracker.tracker_key}-{item.id}" if tracker.tracker_key else str(item.id),type_name=item.typeName or "Requirement",name=clean_text(item.name),description=clean_text(item.description),status=clean_text(item.status.name) if item.status else None,priority=clean_text(item.priority.name) if item.priority else None,categories=_names(item.categories),severities=_names(item.severities),parent_id=item.parent.id if item.parent else None,parent_name=clean_text(item.parent.name) if item.parent else None,child_ids=[c.id for c in item.children],child_names=_names(item.children),version=item.version,ordinal=item.ordinal,created_at=item.createdAt,modified_at=item.modifiedAt,synchronized_at=synchronized_at,custom_fields=_custom(item.customFields))
