"""Low-level asynchronous Codebeamer REST API client."""
from __future__ import annotations
import asyncio
from typing import Any, TypeVar
import httpx
from pydantic import TypeAdapter, ValidationError
from .config import CodebeamerConfig
from .diagnostics import *
from .models import *
T=TypeVar("T")

class CodebeamerClient:
    def __init__(self,config:CodebeamerConfig,transport:httpx.AsyncBaseTransport|None=None):
        self.config=config
        auth=httpx.BasicAuth(config.username or "",config.password or "") if config.auth_mode=="basic" else None
        self._client=httpx.AsyncClient(base_url=f"{config.base_url}/",auth=auth,verify=config.httpx_verify,timeout=httpx.Timeout(config.timeout_seconds),headers={"Accept":"application/json","User-Agent":"lattice-codebeamer-extractor/0.1"},transport=transport)
    async def __aenter__(self): return self
    async def __aexit__(self,*_): await self.aclose()
    async def aclose(self): await self._client.aclose()
    async def _get(self,path:str,model:type[T]|TypeAdapter[T],*,params:dict[str,Any]|None=None,operation:str,source_id:str|None=None)->T:
        try: response=await self._client.get(path.lstrip("/"),params=params)
        except (httpx.TimeoutException,httpx.NetworkError) as exc: raise CodebeamerTransientError(f"Codebeamer {operation} failed: {exc.__class__.__name__}.",operation=operation,source_id=source_id) from exc
        if response.status_code==401: raise CodebeamerAuthenticationError("Codebeamer rejected the configured credentials.",operation=operation,source_id=source_id,http_status=401)
        if response.status_code==403: raise CodebeamerPermissionError("Codebeamer denied access to the requested resource.",operation=operation,source_id=source_id,http_status=403)
        if response.status_code==404: raise CodebeamerNotFoundError("The requested Codebeamer resource was not found.",operation=operation,source_id=source_id,http_status=404)
        if response.status_code==429: raise CodebeamerRateLimitError("Codebeamer rate limited the request.",operation=operation,source_id=source_id,http_status=429)
        if response.status_code>=500: raise CodebeamerTransientError(f"Codebeamer returned HTTP {response.status_code}.",operation=operation,source_id=source_id,http_status=response.status_code)
        if response.status_code>=400: raise CodebeamerError(f"Codebeamer returned HTTP {response.status_code}.",operation=operation,source_id=source_id,http_status=response.status_code)
        try: payload=response.json()
        except ValueError as exc: raise CodebeamerContractError("Codebeamer returned malformed JSON.",operation=operation,source_id=source_id,http_status=response.status_code) from exc
        try: return model.validate_python(payload) if isinstance(model,TypeAdapter) else model.model_validate(payload)
        except ValidationError as exc: raise CodebeamerContractError(f"Codebeamer response did not match the expected contract: {exc.errors(include_url=False)[:3]}",operation=operation,source_id=source_id,http_status=response.status_code) from exc
    async def list_projects(self)->list[ProjectReference]: return await self._get("projects",TypeAdapter(list[ProjectReference]),operation="list-projects")
    async def list_project_trackers(self,project_id:int)->list[TrackerReference]: return await self._get(f"projects/{project_id}/trackers",TypeAdapter(list[TrackerReference]),operation="list-project-trackers",source_id=str(project_id))
    async def get_tracker(self,tracker_id:int)->TrackerMetadata: return await self._get(f"trackers/{tracker_id}",TrackerMetadata,operation="get-tracker",source_id=str(tracker_id))
    async def query_tracker_items(self,tracker_id:int,page:int,page_size:int)->TrackerItemPage: return await self._get("items/query",TrackerItemPage,params={"queryString":f"tracker.id={tracker_id}","page":page,"pageSize":page_size},operation="query-tracker-items",source_id=str(tracker_id))
    async def get_tracker_item_references(self,tracker_id:int,page:int,page_size:int)->TrackerItemReferencePage: return await self._get(f"trackers/{tracker_id}/items",TrackerItemReferencePage,params={"page":page,"pageSize":page_size},operation="list-tracker-items",source_id=str(tracker_id))
    async def get_item(self,item_id:int)->TrackerItem: return await self._get(f"items/{item_id}",TrackerItem,operation="get-item",source_id=str(item_id))
    async def get_relations(self,item_id:int,page:int=1,page_size:int=500)->RelationsResponse: return await self._get(f"items/{item_id}/relations",RelationsResponse,params={"page":page,"pageSize":page_size},operation="get-relations",source_id=str(item_id))
    async def get_attachments(self,item_id:int,page:int=1,page_size:int=100)->AttachmentsResponse: return await self._get(f"items/{item_id}/attachments",AttachmentsResponse,params={"page":page,"pageSize":page_size},operation="get-attachments",source_id=str(item_id))
