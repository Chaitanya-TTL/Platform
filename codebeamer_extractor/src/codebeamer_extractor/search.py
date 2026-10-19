"""Search the verified local Codebeamer catalog without source API calls."""
from __future__ import annotations
from .models import RequirementSearchRequest,RequirementSearchResponse,RequirementSearchResult
from .ranking import normalize_text,rank_requirement,result_sort_key
from .storage import FileCatalogRepository
class EmptySearchQueryError(ValueError):pass
class CatalogUnavailableError(RuntimeError):pass
class CodebeamerSearchService:
    def __init__(self,repository:FileCatalogRepository):self.repository=repository
    def search(self,request:RequirementSearchRequest)->RequirementSearchResponse:
        if not normalize_text(request.query):raise EmptySearchQueryError("Search query cannot be empty.")
        if not 1<=request.limit<=500:raise ValueError("Search limit must be between 1 and 500.")
        catalog=self.repository.load_catalog()
        if catalog is None:raise CatalogUnavailableError("Codebeamer catalog is unavailable. Run synchronization first.")
        matches=[]
        for requirement in catalog.requirements:
            if not request.include_stale and requirement.stale:continue
            if request.project_id is not None and requirement.project_id!=request.project_id:continue
            if request.tracker_id is not None and requirement.tracker_id!=request.tracker_id:continue
            outcome=rank_requirement(requirement,request.query)
            if outcome is None or outcome.score<request.minimum_score:continue
            if not request.include_contextual and outcome.classification=="contextual":continue
            matches.append(RequirementSearchResult(canonical_id=requirement.canonical_id,item_id=requirement.item_id,external_key=requirement.external_key,name=requirement.name,description=requirement.description,project_id=requirement.project_id,project_name=requirement.project_name,tracker_id=requirement.tracker_id,tracker_name=requirement.tracker_name,status=requirement.status,priority=requirement.priority,categories=requirement.categories,severities=requirement.severities,parent_name=requirement.parent_name,child_names=requirement.child_names,version=requirement.version,stale=requirement.stale,score=outcome.score,classification=outcome.classification,matched_fields=list(outcome.matched_fields),explanation=outcome.explanation))
        matches.sort(key=result_sort_key)
        return RequirementSearchResponse(query=request.query,normalized_query=normalize_text(request.query),catalog_revision=catalog.revision,catalog_status=catalog.status,catalog_synchronized_at=catalog.synchronized_at,catalog_requirement_count=len(catalog.requirements),matches=matches[:request.limit])
