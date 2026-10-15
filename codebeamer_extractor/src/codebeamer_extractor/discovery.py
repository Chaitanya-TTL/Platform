"""Dynamic project and requirement-tracker discovery."""
from __future__ import annotations
import asyncio
from .client import CodebeamerClient
from .config import CodebeamerConfig
from .diagnostics import CodebeamerError
from .models import DiscoveryResult, RequirementTrackerDescriptor, TrackerMetadata

def is_requirement_tracker(tracker:TrackerMetadata)->bool:
    return bool(tracker.type and tracker.type.name.strip().casefold()=="requirement" and not tracker.deleted and not tracker.hidden)

class CodebeamerCatalogDiscoverer:
    def __init__(self,client:CodebeamerClient,config:CodebeamerConfig): self.client=client; self.config=config
    def _allowed(self,project_id:int)->bool:
        return (not self.config.project_allowlist or project_id in self.config.project_allowlist) and project_id not in self.config.project_denylist
    async def discover(self)->DiscoveryResult:
        projects=await self.client.list_projects(); selected=[p for p in projects if self._allowed(p.id)]
        failures=[]; descriptors=[]; referenced=0; inspected=0
        semaphore=asyncio.Semaphore(self.config.max_concurrency)
        async def process_project(project):
            nonlocal referenced,inspected
            try: refs=await self.client.list_project_trackers(project.id)
            except CodebeamerError as exc: failures.append(exc.failure("project")); return
            referenced+=len(refs)
            async def inspect(ref):
                nonlocal inspected
                async with semaphore:
                    try: tracker=await self.client.get_tracker(ref.id); inspected+=1
                    except CodebeamerError as exc: failures.append(exc.failure("tracker")); return
                    if is_requirement_tracker(tracker):
                        origin=tracker.project or project
                        descriptors.append(RequirementTrackerDescriptor(project_id=origin.id,project_name=origin.name,tracker_id=tracker.id,tracker_name=tracker.name,tracker_key=tracker.keyName,tracker_type=tracker.type.name if tracker.type else "",tracker_version=tracker.version))
            await asyncio.gather(*(inspect(ref) for ref in refs))
        await asyncio.gather(*(process_project(p) for p in selected))
        descriptors.sort(key=lambda x:(x.project_name.casefold(),x.tracker_name.casefold(),x.tracker_id))
        return DiscoveryResult(instance_key=self.config.instance_key,projects_discovered=len(projects),projects_processed=len(selected),trackers_referenced=referenced,trackers_inspected=inspected,requirement_trackers=descriptors,failures=failures)
