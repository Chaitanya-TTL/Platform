import type { LatticeSource, MatchCategory, SourceSearchOutcome } from "./contracts";
import { SOURCE_LABELS } from "./capability-matrix";

export type DiscoveryPresentation = {
  label: "Not included" | "Ready" | "Searching" | "Results found" | "No results" | "Needs attention";
  title: string;
  message: string;
  technicalDetail?: string;
  actionLabel?: string;
  tone: "idle" | "active" | "success" | "muted" | "warning";
};

const sourceNoun: Record<LatticeSource,string> = { teamcenter:"Teamcenter record", windchill:"Windchill part", sap:"SAP material", configit:"Configit package" };

export function presentOutcome(source:LatticeSource,outcome:SourceSearchOutcome|null,query:string):DiscoveryPresentation{
  if(outcome?.status==="not-requested") return {label:"Not included",title:SOURCE_LABELS[source],message:"This application was not included in the current search.",tone:"muted"};
  if(!outcome) return {label:"Ready",title:SOURCE_LABELS[source],message:`Search ${SOURCE_LABELS[source]} with the same product query.`,tone:"idle"};
  if(["checking-readiness","searching"].includes(outcome.status)) return {label:"Searching",title:`Searching ${SOURCE_LABELS[source]}`,message:`Looking for matching ${sourceNoun[source].toLowerCase()}s.`,tone:"active"};
  if(outcome.status==="succeeded"||outcome.status==="partial") return {label:"Results found",title:`${outcome.results.length} match${outcome.results.length===1?"":"es"} in ${SOURCE_LABELS[source]}`,message:"Choose the record that belongs in this investigation.",technicalDetail:outcome.warning,tone:"success"};
  if(outcome.status==="empty"){
    const message=source==="sap"&&outcome.warning?"The latest available SAP catalogue did not contain this material. Catalogue data may be out of date.":source==="configit"?`No configurable package matched ${query}.`:`No ${sourceNoun[source].toLowerCase()} matched ${query}.`;
    return {label:"No results",title:source==="configit"?"Configit package not found":`No current ${SOURCE_LABELS[source]} match`,message,technicalDetail:outcome.warning,actionLabel:outcome.retryable?`Search ${SOURCE_LABELS[source]} again`:undefined,tone:"muted"};
  }
  if(outcome.status==="cancelled") return {label:"Needs attention",title:`${SOURCE_LABELS[source]} search stopped`,message:"The search was cancelled. Results from other sources are still available.",actionLabel:`Retry ${SOURCE_LABELS[source]}`,tone:"warning"};
  const unavailable=outcome.status==="unavailable";
  return {label:"Needs attention",title:unavailable?`${SOURCE_LABELS[source]} is temporarily unavailable`:`${SOURCE_LABELS[source]} needs attention`,message:`${SOURCE_LABELS[source]} could not be searched right now. Results from other sources are still available.`,technicalDetail:outcome.error?.safeDetail??outcome.error?.message??outcome.warning,actionLabel:`Retry ${SOURCE_LABELS[source]}`,tone:"warning"};
}

export function presentMatch(category:MatchCategory){
  if(category==="verified-identifier-match"||category==="deterministic-normalized-id-match") return "Verified match";
  if(category==="source-native-reference") return "Source record";
  if(category==="exact-normalized-name-match"||category==="structure-supported-probable-match"||category==="probable-match") return "Likely match";
  if(category==="ambiguous-candidate") return "Review match";
  return "Unresolved";
}

export function cleanInvestigationLabel(value:string){
  const parts=value.split(/\s*[+|Â·]\s*/).map(item=>item.trim()).filter(Boolean);
  const unique=[...new Set(parts)];
  if(unique.length) return unique[0];
  const half=value.slice(0,Math.floor(value.length/2));
  return half&&value===half+half?half:value||"Engineering investigation";
}
