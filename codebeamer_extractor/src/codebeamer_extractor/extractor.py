"""Complete paginated requirement extraction."""
from __future__ import annotations
import asyncio
from .client import CodebeamerClient
from .config import CodebeamerConfig
from .diagnostics import CodebeamerError, CodebeamerPaginationError
from .discovery import CodebeamerCatalogDiscoverer
from .models import ExtractionResult, RequirementTrackerDescriptor, TrackerExtraction

class CodebeamerRequirementExtractor:
    def __init__(self,client:CodebeamerClient,config:CodebeamerConfig): self.client=client; self.config=config
    async def extract_tracker(self,tracker:RequirementTrackerDescriptor)->TrackerExtraction:
        items={}; pages=duplicates=expected=0; previous_signature=None
        try:
            for page_number in range(1,self.config.max_pages+1):
                page=await self.client.query_tracker_items(tracker.tracker_id,page_number,self.config.page_size); pages+=1; expected=max(expected,page.total)
                signature=tuple(item.id for item in page.items)
                if not page.items: return TrackerExtraction(tracker=tracker,items=list(items.values()),pages_requested=pages,duplicate_items=duplicates,expected_total=expected,complete=len(items)>=expected)
                if signature==previous_signature: raise CodebeamerPaginationError(f"Repeated page detected for tracker {tracker.tracker_id} at page {page_number}.",operation="query-tracker-items",source_id=str(tracker.tracker_id))
                before=len(items)
                for item in page.items:
                    if item.id in items: duplicates+=1
                    items[item.id]=item
                if len(items)>=page.total or page.isLastPage is True: return TrackerExtraction(tracker=tracker,items=sorted(items.values(),key=lambda x:((x.ordinal or 10**9),x.id)),pages_requested=pages,duplicate_items=duplicates,expected_total=expected,complete=True)
                if len(items)==before: raise CodebeamerPaginationError(f"Pagination made no progress for tracker {tracker.tracker_id} at page {page_number}.",operation="query-tracker-items",source_id=str(tracker.tracker_id))
                previous_signature=signature
            raise CodebeamerPaginationError(f"Tracker {tracker.tracker_id} exceeded maximum page limit {self.config.max_pages}.",operation="query-tracker-items",source_id=str(tracker.tracker_id))
        except CodebeamerError as exc:
            return TrackerExtraction(tracker=tracker,items=sorted(items.values(),key=lambda x:x.id),pages_requested=pages,duplicate_items=duplicates,expected_total=expected,complete=False,failure=exc.failure("tracker"))
    async def extract_all(self,discoverer:CodebeamerCatalogDiscoverer|None=None)->ExtractionResult:
        discovery=await (discoverer or CodebeamerCatalogDiscoverer(self.client,self.config)).discover()
        semaphore=asyncio.Semaphore(self.config.max_concurrency)
        async def run(t):
            async with semaphore: return await self.extract_tracker(t)
        trackers=await asyncio.gather(*(run(t) for t in discovery.requirement_trackers))
        return ExtractionResult(instance_key=self.config.instance_key,trackers=list(trackers),discovery_failures=discovery.failures)
