"""Catalog synchronization with last-good-data preservation."""
import hashlib
from datetime import datetime,timezone
from .hierarchy import build_hierarchy
from .mapper import map_requirement
from .models import CatalogSnapshot,SyncState,TrackerSyncState
from .storage import FileCatalogRepository
def _now()->str:return datetime.now(timezone.utc).isoformat()
def _revision(instance:str,at:str,count:int)->str:return hashlib.sha256(f"{instance}|{at}|{count}".encode()).hexdigest()[:16]
class CodebeamerSyncCoordinator:
    def __init__(self,extractor,repository:FileCatalogRepository):self.extractor=extractor;self.repository=repository
    async def synchronize(self,discoverer=None)->CatalogSnapshot:
        previous=self.repository.load_catalog();result=await self.extractor.extract_all(discoverer);at=_now();failures=list(result.discovery_failures);previous_by_tracker={}
        if previous:
            for item in previous.requirements:previous_by_tracker.setdefault(item.tracker_id,[]).append(item)
        requirements=[];states=[]
        for extracted in result.trackers:
            tid=extracted.tracker.tracker_id
            if extracted.failure:
                failures.append(extracted.failure);preserved=[item.model_copy(update={"stale":True}) for item in previous_by_tracker.get(tid,[])];requirements.extend(preserved);states.append(TrackerSyncState(tracker_id=tid,project_id=extracted.tracker.project_id,status="stale" if preserved else "failed",requirement_count=len(preserved),synchronized_at=at,failure=extracted.failure));continue
            mapped=[map_requirement(item,extracted.tracker,result.instance_key,at) for item in extracted.items];requirements.extend(mapped);states.append(TrackerSyncState(tracker_id=tid,project_id=extracted.tracker.project_id,status="complete",requirement_count=len(mapped),synchronized_at=at))
        requirements.sort(key=lambda x:(x.project_name.casefold(),x.tracker_name.casefold(),x.ordinal or 10**9,x.item_id));hierarchy,duplicates=build_hierarchy(requirements);status="partial" if failures else "complete";revision=_revision(result.instance_key,at,len(requirements))
        snapshot=CatalogSnapshot(instance_key=result.instance_key,revision=revision,synchronized_at=at,status=status,requirements=requirements,hierarchy=hierarchy,tracker_states=states,failures=failures,duplicate_hierarchy_edges_removed=duplicates)
        old_state=self.repository.load_sync_state();state=SyncState(instance_key=result.instance_key,last_attempt_at=at,last_successful_sync_at=at if status=="complete" else (old_state.last_successful_sync_at if old_state else None),catalog_revision=revision,status=status,requirement_count=len(requirements),hierarchy_edge_count=len(hierarchy),tracker_count=len(states),stale_tracker_count=sum(s.status=="stale" for s in states),failed_tracker_count=sum(s.status=="failed" for s in states));self.repository.save_catalog(snapshot);self.repository.save_sync_state(state);return snapshot
