"""Codebeamer transport, normalized catalog, and synchronization models."""
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

class CBModel(BaseModel): model_config=ConfigDict(extra="allow",populate_by_name=True)
class Reference(CBModel): id:int; name:str; type:str|None=None
class ProjectReference(Reference): pass
class TrackerReference(Reference): pass
class UserReference(Reference): email:str|None=None
class ChoiceOptionReference(Reference): pass
class TrackerTypeReference(Reference): pass
class TrackerItemReference(Reference): testStepReuse:bool|None=None
class TrackerMetadata(CBModel):
    id:int; name:str; keyName:str|None=None; version:int|None=None; type:TrackerTypeReference|None=None; project:ProjectReference|None=None; deleted:bool=False; hidden:bool=False
class TrackerItem(CBModel):
    id:int; name:str; description:str|None=None; descriptionFormat:str|None=None; createdAt:str|None=None; createdBy:UserReference|None=None; modifiedAt:str|None=None; modifiedBy:UserReference|None=None; version:int|None=None; assignedTo:list[Reference]=Field(default_factory=list); parent:TrackerItemReference|None=None; tracker:TrackerReference|None=None; children:list[TrackerItemReference]=Field(default_factory=list); customFields:list[Any]=Field(default_factory=list); priority:ChoiceOptionReference|None=None; status:ChoiceOptionReference|None=None; categories:list[ChoiceOptionReference]=Field(default_factory=list); severities:list[ChoiceOptionReference]=Field(default_factory=list); teams:list[Reference]=Field(default_factory=list); versions:list[Reference]=Field(default_factory=list); ordinal:int|None=None; typeName:str|None=None; comments:list[Any]=Field(default_factory=list); tags:list[Any]=Field(default_factory=list)
class TrackerItemPage(CBModel): page:int=1; pageSize:int=25; total:int=0; items:list[TrackerItem]=Field(default_factory=list); isLastPage:bool|None=None
class TrackerItemReferencePage(CBModel): page:int=1; pageSize:int=25; total:int=0; itemRefs:list[TrackerItemReference]=Field(default_factory=list); isLastPage:bool|None=None
class RelationsResponse(CBModel): itemId:dict[str,Any]|None=None; downstreamReferences:list[Any]=Field(default_factory=list); upstreamReferences:list[Any]=Field(default_factory=list); incomingAssociations:list[Any]=Field(default_factory=list); outgoingAssociations:list[Any]=Field(default_factory=list); page:int=1; pageSize:int=500; itemCount:int=0; isLastPage:bool=True
class AttachmentReference(CBModel): id:int|None=None; name:str|None=None; fileName:str|None=None; mimeType:str|None=None; size:int|None=None
class AttachmentsResponse(CBModel): page:int=1; pageSize:int=0; total:int=0; attachments:list[AttachmentReference]=Field(default_factory=list)
class RequirementTrackerDescriptor(BaseModel): project_id:int; project_name:str; tracker_id:int; tracker_name:str; tracker_key:str|None=None; tracker_type:str; tracker_version:int|None=None
class SourceFailure(BaseModel): scope:str; operation:str; source_id:str|None=None; classification:str; message:str; retryable:bool=False; http_status:int|None=None
class DiscoveryResult(BaseModel): instance_key:str; projects_discovered:int; projects_processed:int; trackers_referenced:int; trackers_inspected:int; requirement_trackers:list[RequirementTrackerDescriptor]=Field(default_factory=list); failures:list[SourceFailure]=Field(default_factory=list)
class TrackerExtraction(BaseModel): tracker:RequirementTrackerDescriptor; items:list[TrackerItem]=Field(default_factory=list); pages_requested:int=0; duplicate_items:int=0; expected_total:int=0; complete:bool=False; failure:SourceFailure|None=None
class ExtractionResult(BaseModel): instance_key:str; trackers:list[TrackerExtraction]=Field(default_factory=list); discovery_failures:list[SourceFailure]=Field(default_factory=list)

class NormalizedRequirement(BaseModel):
    source:Literal["codebeamer"]="codebeamer"; source_instance:str; canonical_id:str; project_id:int; project_name:str; tracker_id:int; tracker_name:str; tracker_type:str; item_id:int; external_key:str; type_name:str="Requirement"; name:str; description:str=""; status:str|None=None; priority:str|None=None; categories:list[str]=Field(default_factory=list); severities:list[str]=Field(default_factory=list); parent_id:int|None=None; parent_name:str|None=None; child_ids:list[int]=Field(default_factory=list); child_names:list[str]=Field(default_factory=list); version:int|None=None; ordinal:int|None=None; created_at:str|None=None; modified_at:str|None=None; synchronized_at:str; stale:bool=False; custom_fields:dict[str,str|int|float|bool]=Field(default_factory=dict)
class HierarchyEdge(BaseModel):
    id:str; source:str; target:str; relationship:Literal["parent-of"]="parent-of"; parent_id:int; child_id:int; unresolved_parent:bool=False; unresolved_child:bool=False
class TrackerSyncState(BaseModel):
    tracker_id:int; project_id:int; status:Literal["complete","stale","failed"]; requirement_count:int; synchronized_at:str; failure:SourceFailure|None=None
class CatalogSnapshot(BaseModel):
    schema_version:str="1.0"; instance_key:str; revision:str; synchronized_at:str; status:Literal["complete","partial"]; requirements:list[NormalizedRequirement]=Field(default_factory=list); hierarchy:list[HierarchyEdge]=Field(default_factory=list); tracker_states:list[TrackerSyncState]=Field(default_factory=list); failures:list[SourceFailure]=Field(default_factory=list); duplicate_hierarchy_edges_removed:int=0; integrity_hash:str|None=None
class SyncState(BaseModel):
    instance_key:str; last_attempt_at:str; last_successful_sync_at:str|None=None; catalog_revision:str; status:Literal["complete","partial"]; requirement_count:int; hierarchy_edge_count:int; tracker_count:int; stale_tracker_count:int=0; failed_tracker_count:int=0

class RequirementSearchRequest(BaseModel):
    query:str; limit:int=25; include_contextual:bool=True; include_stale:bool=True; minimum_score:int=1; project_id:int|None=None; tracker_id:int|None=None
    model_config=ConfigDict(str_strip_whitespace=True)
class RequirementSearchResult(BaseModel):
    canonical_id:str; item_id:int; external_key:str; name:str; description:str; project_id:int; project_name:str; tracker_id:int; tracker_name:str; status:str|None=None; priority:str|None=None; categories:list[str]=Field(default_factory=list); severities:list[str]=Field(default_factory=list); parent_name:str|None=None; child_names:list[str]=Field(default_factory=list); version:int|None=None; stale:bool=False; score:int; classification:Literal["direct","contextual"]; matched_fields:list[str]=Field(default_factory=list); explanation:str
class RequirementSearchResponse(BaseModel):
    query:str; normalized_query:str; catalog_revision:str; catalog_status:Literal["complete","partial"]; catalog_synchronized_at:str; catalog_requirement_count:int; matches:list[RequirementSearchResult]=Field(default_factory=list)
class ItemEnrichment(BaseModel):
    item:TrackerItem; relations:RelationsResponse|None=None; attachments:AttachmentsResponse|None=None; failures:list[SourceFailure]=Field(default_factory=list)


EnrichmentStatus = Literal["not-requested", "loading", "loaded-empty", "loaded", "partial", "failed"]
class EnrichmentSection(CBModel):
    status: EnrichmentStatus
    retrievedAt: str | None = None
    count: int = 0
    data: Any | None = None
    failures: list[SourceFailure] = Field(default_factory=list)

class ItemEnrichmentV2(CBModel):
    contractVersion: Literal["2.0"] = "2.0"
    status: Literal["complete", "partial-success"]
    item: EnrichmentSection
    relations: EnrichmentSection
    attachments: EnrichmentSection
    failures: list[SourceFailure] = Field(default_factory=list)
    retrievedAt: str
