import type { LatticeSource, MatchCategory, NormalizedSearchResult, SourceSearchOutcome } from "./contracts";
import { SOURCE_LABELS } from "./capability-matrix";

export type DiscoveryPresentation = {
  label: "Not included" | "Ready" | "Searching" | "Results found" | "No results" | "Needs attention";
  title: string;
  message?: string;
  technicalDetail?: string;
  actionLabel?: string;
  tone: "idle" | "active" | "success" | "muted" | "warning";
};

const sourceNoun: Record<LatticeSource,string> = { teamcenter:"Teamcenter record", windchill:"Windchill part", sap:"SAP material", configit:"Configit package", codebeamer:"Codebeamer requirement" };

export function presentOutcome(source:LatticeSource,outcome:SourceSearchOutcome|null,query:string):DiscoveryPresentation{
  if(outcome?.status==="not-requested") return {label:"Not included",title:SOURCE_LABELS[source],message:"This application was not included in the current search.",tone:"muted"};
  if(!outcome) return {label:"Ready",title:SOURCE_LABELS[source],message:`Search ${SOURCE_LABELS[source]} with the same product query.`,tone:"idle"};
  if(["checking-readiness","searching"].includes(outcome.status)) return {label:"Searching",title:`Searching ${SOURCE_LABELS[source]}`,message:`Looking for matching ${sourceNoun[source].toLowerCase()}s.`,tone:"active"};
  if(outcome.status==="succeeded"||outcome.status==="partial") return {label:"Results found",title:`${outcome.results.length} match${outcome.results.length===1?"":"es"} in ${SOURCE_LABELS[source]}`,technicalDetail:outcome.warning,tone:"success"};
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
  const parts=value.split(/\s*[+|Ã‚Â·]\s*/).map(item=>item.trim()).filter(Boolean);
  const unique=[...new Set(parts)];
  if(unique.length) return unique[0];
  const half=value.slice(0,Math.floor(value.length/2));
  return half&&value===half+half?half:value||"Engineering investigation";
}

type SourceContextField = { label: string; value: unknown };

function presentValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

function addContextField(context: Array<{ label: string; value: string }>, field: SourceContextField) {
  const value = presentValue(field.value);
  if (value) context.push({ label: field.label, value });
}

function metadataValue(result: NormalizedSearchResult, key: string): unknown {
  return result.sourceMetadata[key];
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => presentValue(value) !== undefined);
}

export function presentRecordIdentity(result: NormalizedSearchResult): string {
  const parts = [result.entityType.trim(), result.nativeId.trim()].filter(
    (part) => part.length > 0 && part !== "engineering-record",
  );
  const revision = presentValue(result.revision);
  const version = presentValue(result.version);
  if (revision) parts.push(`Revision ${revision}`);
  if (version) parts.push(`Version ${version}`);
  return parts.join(" · ");
}

export function presentSourceContext(result: NormalizedSearchResult): Array<{ label: string; value: string }> {
  const context: Array<{ label: string; value: string }> = [];
  const metadata = (key: string) => metadataValue(result, key);

  if (result.source === "windchill") {
    addContextField(context, { label: "Part number", value: metadata("partNumber") });
    addContextField(context, { label: "Lifecycle", value: result.lifecycleState });
    addContextField(context, { label: "Plant", value: metadata("plant") });
  } else if (result.source === "sap") {
    addContextField(context, { label: "Plant", value: metadata("plant") });
    addContextField(context, { label: "Catalog status", value: metadata("catalogStatus") });
    const stale = metadata("stale");
    if (typeof stale === "boolean") {
      addContextField(context, {
        label: "Freshness",
        value: stale ? "Stale" : "Current",
      });
    }
  } else if (result.source === "configit") {
    addContextField(context, { label: "Model code", value: metadata("productModelCode") });
    addContextField(context, {
      label: "Package path",
      value: firstPresent(metadata("resolvedPackagePath"), metadata("logicalPackagePath")),
    });
    addContextField(context, {
      label: "Package state",
      value: firstPresent(metadata("packageState"), result.lifecycleState),
    });
  } else if (result.source === "codebeamer") {
    addContextField(context, { label: "External key", value: metadata("externalKey") });
    addContextField(context, {
      label: "Tracker",
      value: firstPresent(metadata("trackerName"), metadata("trackerId")),
    });
    addContextField(context, {
      label: "Project",
      value: firstPresent(metadata("projectName"), metadata("projectId")),
    });
  }

  return context;
}

const sourceContextKeys: Record<LatticeSource, ReadonlySet<string>> = {
  teamcenter: new Set(),
  windchill: new Set(["partNumber", "plant"]),
  sap: new Set(["plant", "catalogStatus", "stale"]),
  configit: new Set([
    "productModelCode",
    "resolvedPackagePath",
    "logicalPackagePath",
    "packageState",
  ]),
  codebeamer: new Set([
    "externalKey",
    "trackerName",
    "trackerId",
    "projectName",
    "projectId",
  ]),
};

function presentMetadataLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

export function presentAdditionalSourceContext(
  result: NormalizedSearchResult,
): Array<{ label: string; value: string }> {
  const excludedKeys = new Set([
    ...sourceContextKeys[result.source],
    "objectType",
    "revision",
    "version",
    "lifecycleState",
  ]);
  const context: Array<{ label: string; value: string }> = [];

  for (const [key, value] of Object.entries(result.sourceMetadata)) {
    if (!excludedKeys.has(key)) {
      addContextField(context, { label: presentMetadataLabel(key), value });
    }
  }

  return context;
}
