"""Bounded on-demand item, relation, and attachment enrichment."""
from __future__ import annotations
from .diagnostics import CodebeamerError
from .models import ItemEnrichment
class CodebeamerEnrichmentService:
    def __init__(self,client):self.client=client
    async def enrich(self,item_id:int,*,include_relations:bool=True,include_attachments:bool=True)->ItemEnrichment:
        item=await self.client.get_item(item_id);relations=None;attachments=None;failures=[]
        if include_relations:
            try:relations=await self.client.get_relations(item_id)
            except CodebeamerError as exc:failures.append(exc.failure("item-relations"))
        if include_attachments:
            try:attachments=await self.client.get_attachments(item_id)
            except CodebeamerError as exc:failures.append(exc.failure("item-attachments"))
        return ItemEnrichment(item=item,relations=relations,attachments=attachments,failures=failures)
