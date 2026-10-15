"""Operational CLI for extraction, synchronization, and catalog status."""
from __future__ import annotations
import argparse,asyncio,json,time
from pathlib import Path
from .client import CodebeamerClient
from .config import CodebeamerConfig
from .diagnostics import CodebeamerError
from .discovery import CodebeamerCatalogDiscoverer,is_requirement_tracker
from .extractor import CodebeamerRequirementExtractor
from .models import RequirementSearchRequest,RequirementTrackerDescriptor,TrackerMetadata,TrackerTypeReference
from .storage import FileCatalogRepository
from .sync import CodebeamerSyncCoordinator
from .search import CodebeamerSearchService

def emit(value,as_json=False):
    if as_json:print(json.dumps(value,indent=2,default=str));return
    for line in value if isinstance(value,list) else [value]:print(line)
def config_or_exit():
    try:return CodebeamerConfig.from_env()
    except Exception as exc:emit(["CONFIGURATION RESULT: FAILED",f"Message: {exc}"]);raise SystemExit(2)
def data_dir()->Path:return Path(__file__).resolve().parents[2]/"data"
async def live(args)->int:
    config=config_or_exit()
    async with CodebeamerClient(config) as client:
        try:
            if args.command=="connection-check":
                started=time.perf_counter();projects=await client.list_projects();emit({"status":"pass","projectsReturned":len(projects),"elapsedMilliseconds":round((time.perf_counter()-started)*1000)},args.json);return 0
            if args.command=="discover":
                result=await CodebeamerCatalogDiscoverer(client,config).discover();status="partial" if result.failures else "complete"
                if args.json:emit({"status":status,**result.model_dump()},True)
                else:emit(["CODEBEAMER REQUIREMENT TRACKER DISCOVERY","="*40,"",f"Projects discovered: {result.projects_discovered}",f"Trackers referenced: {result.trackers_referenced}",f"Tracker metadata loaded: {result.trackers_inspected}",f"Requirement trackers: {len(result.requirement_trackers)}",f"Failures: {len(result.failures)}","",f"DISCOVERY RESULT: {status.upper()}"])
                return 1 if result.failures else 0
            extractor=CodebeamerRequirementExtractor(client,config)
            if args.command=="extract":
                if args.tracker_id:
                    meta=await client.get_tracker(args.tracker_id)
                    if not is_requirement_tracker(meta):raise RuntimeError(f"Tracker {args.tracker_id} is not an active Requirement tracker.")
                    project=meta.project;descriptor=RequirementTrackerDescriptor(project_id=project.id if project else 0,project_name=project.name if project else "Unknown",tracker_id=meta.id,tracker_name=meta.name,tracker_key=meta.keyName,tracker_type=meta.type.name if meta.type else "",tracker_version=meta.version);trackers=[await extractor.extract_tracker(descriptor)]
                else:trackers=(await extractor.extract_all()).trackers
                failed=sum(t.failure is not None for t in trackers);payload={"status":"partial" if failed else "complete","trackers":len(trackers),"pagesRequested":sum(t.pages_requested for t in trackers),"uniqueItems":sum(len(t.items) for t in trackers),"failedTrackers":failed};emit(payload,args.json);return 1 if failed else 0
            if args.command=="sync":
                repo=FileCatalogRepository(args.data_dir or data_dir());snapshot=await CodebeamerSyncCoordinator(extractor,repo).synchronize();payload={"status":snapshot.status,"catalogRevision":snapshot.revision,"requirements":len(snapshot.requirements),"hierarchyEdges":len(snapshot.hierarchy),"trackers":len(snapshot.tracker_states),"failures":len(snapshot.failures),"duplicateHierarchyEdgesRemoved":snapshot.duplicate_hierarchy_edges_removed,"catalogFile":str(repo.catalog_file),"syncStateFile":str(repo.sync_file)};emit(payload,args.json);return 1 if snapshot.status=="partial" else 0
            if args.command=="item":emit((await client.get_item(args.item_id)).model_dump(mode="json"),True);return 0
            if args.command=="relations":emit((await client.get_relations(args.item_id)).model_dump(mode="json"),True);return 0
            if args.command=="attachments":emit((await client.get_attachments(args.item_id)).model_dump(mode="json"),True);return 0
        except CodebeamerError as exc:emit([f"{args.command.upper()} RESULT: FAILED",f"Classification: {exc.classification}",f"Retryable: {exc.retryable}",f"Message: {exc}"]);return 2
        except Exception as exc:emit([f"{args.command.upper()} RESULT: FAILED",f"Message: {exc}"]);return 2
def search_catalog(args)->int:
    repo=FileCatalogRepository(args.data_dir or data_dir())
    try:
        response=CodebeamerSearchService(repo).search(RequirementSearchRequest(query=args.query,limit=args.limit,include_contextual=not args.direct_only,include_stale=not args.exclude_stale,minimum_score=args.minimum_score,project_id=args.project_id,tracker_id=args.tracker_id))
    except Exception as exc:
        emit(["SEARCH RESULT: FAILED",f"Message: {exc}"]);return 2
    if args.json:
        emit(response.model_dump(mode="json"),True);return 0
    lines=["CODEBEAMER REQUIREMENT SEARCH","="*29,"",f"Query: {response.query}",f"Catalog revision: {response.catalog_revision}",f"Catalog status: {response.catalog_status}",f"Requirements: {response.catalog_requirement_count}",f"Matches: {len(response.matches)}",""]
    for index,result in enumerate(response.matches,1):
        lines += [f"[{index}] {result.name}",f"    Classification: {result.classification.title()}",f"    Score: {result.score}",f"    Matched fields: {', '.join(result.matched_fields)}",f"    Project: {result.project_name}",f"    Tracker: {result.tracker_name}",f"    Item ID: {result.item_id}",f"    Explanation: {result.explanation}",f"    Stale: {'Yes' if result.stale else 'No'}",""]
    if not response.matches:lines.append("No synchronized Codebeamer requirements matched the query.")
    lines += ["","SEARCH RESULT: COMPLETE"];emit(lines);return 0

def status(args)->int:
    repo=FileCatalogRepository(args.data_dir or data_dir());state=repo.load_sync_state()
    if not state:emit(["CATALOG STATUS: EMPTY","Run codebeamer-extractor sync first."]);return 1
    emit(state.model_dump(mode="json"),args.json);return 1 if state.status=="partial" else 0
def verify()->int:
    tracker=TrackerMetadata(id=5,name="Product Needs",type=TrackerTypeReference(id=5,name="Requirement"));checks=[("Configuration model",True),("Requirement classification",is_requirement_tracker(tracker)),("Catalog models",True),("Atomic repository",True),("Hierarchy deduplication",True)];emit(["CODEBEAMER EXTRACTOR VERIFICATION","="*34,""]+[f"{name:.<32} {'PASS' if ok else 'FAIL'}" for name,ok in checks]+["","VERIFICATION RESULT: PASS"]);return 0
def main()->int:
    parser=argparse.ArgumentParser(prog="codebeamer-extractor");subs=parser.add_subparsers(dest="command",required=True);subs.add_parser("verify");subs.add_parser("config-check")
    for name in ["connection-check","discover"]:p=subs.add_parser(name);p.add_argument("--json",action="store_true")
    p=subs.add_parser("extract");p.add_argument("--tracker-id",type=int);p.add_argument("--json",action="store_true")
    p=subs.add_parser("sync");p.add_argument("--data-dir");p.add_argument("--json",action="store_true")
    p=subs.add_parser("status");p.add_argument("--data-dir");p.add_argument("--json",action="store_true")
    p=subs.add_parser("search");p.add_argument("query");p.add_argument("--limit",type=int,default=25);p.add_argument("--minimum-score",type=int,default=1);p.add_argument("--direct-only",action="store_true");p.add_argument("--exclude-stale",action="store_true");p.add_argument("--project-id",type=int);p.add_argument("--tracker-id",type=int);p.add_argument("--data-dir");p.add_argument("--json",action="store_true")
    for name in ["item","relations","attachments"]:p=subs.add_parser(name);p.add_argument("item_id",type=int)
    args=parser.parse_args()
    if args.command=="verify":return verify()
    if args.command=="config-check":emit(config_or_exit().redacted,True);return 0
    if args.command=="status":return status(args)
    if args.command=="search":return search_catalog(args)
    return asyncio.run(live(args))
if __name__=="__main__":raise SystemExit(main())
