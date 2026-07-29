"use client";
import { useSyncExternalStore } from "react";
import { requirementCatalog, reverseTrace, traceRequirements } from "@/lib/requirement-trace-data";
import type { SourceType, TreeNodeData } from "@/types/bom-comparison";
import type { RequirementCatalogEntry, RequirementTraceSnapshot } from "@/types/requirement-trace";
const listeners=new Set<()=>void>();
let snapshot:RequirementTraceSnapshot={enabled:false,result:null,modalOpen:false,loadedBoms:{},explorerOpen:false,selectedRequirement:null,focus:null};
function emit(){snapshot={...snapshot,loadedBoms:{...snapshot.loadedBoms}};listeners.forEach(listener=>listener());}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function registerRequirementBom(source:SourceType,root:TreeNodeData|null){if(root)snapshot.loadedBoms[source]=root;else delete snapshot.loadedBoms[source];emit();}
export function setRequirementTraceEnabled(enabled:boolean){snapshot.enabled=enabled;snapshot.result=null;snapshot.modalOpen=false;if(enabled){snapshot.selectedRequirement=null;snapshot.focus=null;}emit();}
export function runRequirementTrace(source:SourceType,node:TreeNodeData,open=false){if(!snapshot.enabled)return;snapshot.result=traceRequirements(source,node,snapshot.loadedBoms);snapshot.modalOpen=open;emit();}
export function openRequirementModal(){if(snapshot.result)snapshot.modalOpen=true;emit();}
export function closeRequirementModal(){snapshot.modalOpen=false;emit();}
export function openRequirementsExplorer(){snapshot.explorerOpen=true;emit();}
export function closeRequirementsExplorer(){snapshot.explorerOpen=false;emit();}
export function getLoadedRequirementCatalog(){return requirementCatalog(snapshot.loadedBoms);}
export function selectRequirement(entry:RequirementCatalogEntry){snapshot.selectedRequirement=entry;snapshot.focus=reverseTrace(entry,snapshot.loadedBoms);snapshot.enabled=false;snapshot.result=null;snapshot.modalOpen=false;emit();}
export const focusRequirement=selectRequirement;
export function clearRequirementFocus(){snapshot.selectedRequirement=null;snapshot.focus=null;emit();}
export function useRequirementTrace(){return useSyncExternalStore(subscribe,()=>snapshot,()=>snapshot);}
