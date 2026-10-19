import type { EngineeringEntity } from "../domain/model";

type Scalar = string | number | boolean;
type Row = readonly [string, Scalar];

const title = (value: string) => value
  .replace(/^codebeamer\./, "")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/[._-]+/g, " ")
  .replace(/^./, (letter) => letter.toUpperCase());

const present = (value: Scalar | undefined) => {
  if (value === undefined || value === "") return "Not supplied";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const rows = (entity: EngineeringEntity, keys: readonly string[]): Row[] => keys
  .flatMap((key) => entity.attributes[key] === undefined ? [] : [[key, entity.attributes[key]] as const]);

const prefixed = (entity: EngineeringEntity, prefix: string, excluded: ReadonlySet<string> = new Set()): Row[] =>
  Object.entries(entity.attributes)
    .filter(([key]) => key.startsWith(prefix) && !excluded.has(key))
    .sort(([left], [right]) => left.localeCompare(right));

function DetailSection({ heading, values, empty }: { heading: string; values: Row[]; empty: string }) {
  return <section className="mt-6 text-xs leading-5">
    <h3 className="text-[10px] font-bold uppercase tracking-[.14em] text-sky-400">{heading}</h3>
    {values.length ? <dl className="mt-2">
      {values.map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-3 border-b border-slate-800 py-2.5">
        <dt className="text-slate-500">{title(key)}</dt>
        <dd className="break-words text-right text-slate-200">{present(value)}</dd>
      </div>)}
    </dl> : <p className="mt-2 text-slate-500">{empty}</p>}
  </section>;
}

const evidenceTone: Record<string, string> = {
  loaded: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  "loaded-empty": "border-slate-700 bg-slate-900 text-slate-300",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  unavailable: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  "not-requested": "border-slate-800 bg-slate-950 text-slate-500",
};

function EvidenceCard({ label, status, count, retrievedAt, failure }: { label: string; status: string; count?: Scalar; retrievedAt?: Scalar; failure?: Scalar }) {
  const empty = status === "loaded-empty";
  return <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
    <div className="flex items-center justify-between gap-3">
      <b className="text-slate-200">{label}</b>
      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${evidenceTone[status] ?? evidenceTone["not-requested"]}`}>{status.replaceAll("-", " ")}</span>
    </div>
    <p className="mt-2 text-slate-400">{empty ? `No ${label.toLowerCase()} returned by the source.` : count !== undefined ? `${count} record${Number(count) === 1 ? "" : "s"}` : "Retrieval state reported by Codebeamer."}</p>
    {retrievedAt ? <p className="mt-1 text-[10px] text-slate-600">Retrieved {String(retrievedAt)}</p> : null}
    {failure ? <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-amber-200">{String(failure)}</p> : null}
  </div>;
}

export function CodebeamerInspectorSections({ entity }: { entity: EngineeringEntity }) {
  if (entity.source !== "codebeamer" || (entity.canonicalKind ?? entity.kind) !== "requirement") return null;
  const a = entity.attributes;
  const overview = rows(entity, ["codebeamer.itemId", "codebeamer.externalKey", "codebeamer.typeName", "codebeamer.description", "codebeamer.descriptionFormat", "codebeamer.version"]);
  const lifecycle = rows(entity, ["codebeamer.status", "codebeamer.priority", "codebeamer.categories", "codebeamer.severities", "codebeamer.ordinal"]);
  const ownership = rows(entity, ["codebeamer.createdAt", "codebeamer.createdBy", "codebeamer.modifiedAt", "codebeamer.modifiedBy", "codebeamer.assignedTo", "codebeamer.teams"]);
  const classification = rows(entity, ["codebeamer.tags", "codebeamer.versions", "codebeamer.customFieldCount"]);
  const hierarchy = rows(entity, ["codebeamer.parentName", "codebeamer.childCount", "codebeamer.children"]);
  const context = rows(entity, ["codebeamer.projectName", "codebeamer.projectId", "codebeamer.trackerName", "codebeamer.trackerId", "codebeamer.catalogRevision", "codebeamer.catalogStatus", "codebeamer.catalogSynchronizedAt"]);
  const custom = prefixed(entity, "codebeamer.custom.");
  const known = new Set([...overview, ...lifecycle, ...ownership, ...classification, ...hierarchy, ...context, ...custom].map(([key]) => key));
  const additional = prefixed(entity, "codebeamer.source.", known);
  const itemStatus = String(a["codebeamer.evidence.item.status"] ?? "not-requested");
  const relationStatus = String(a["codebeamer.evidence.relations.status"] ?? "not-requested");
  const attachmentStatus = String(a["codebeamer.evidence.attachments.status"] ?? "not-requested");
  const catalogStatus = a["codebeamer.catalogStatus"] === undefined ? "not-requested" : "loaded";
  return <>
    <DetailSection heading="Overview" values={overview} empty="No overview fields were supplied." />
    <DetailSection heading="Lifecycle" values={lifecycle} empty="No lifecycle values were supplied." />
    <DetailSection heading="Ownership" values={ownership} empty="No owners or assignments were supplied." />
    <DetailSection heading="Classification" values={classification} empty="No classification values were supplied." />
    <DetailSection heading="Hierarchy" values={hierarchy} empty="No parent or child hierarchy was supplied." />
    <DetailSection heading="Source context" values={context} empty="No project or tracker context was supplied." />
    <DetailSection heading="Custom fields" values={custom} empty="No custom fields." />
    <DetailSection heading="Additional source fields" values={additional} empty="No additional source fields." />
    <section className="mt-6 text-xs leading-5">
      <h3 className="text-[10px] font-bold uppercase tracking-[.14em] text-sky-400">Evidence</h3>
      <div className="mt-2 grid gap-2">
        <EvidenceCard label="Live item" status={itemStatus} count={a["codebeamer.evidence.item.count"]} retrievedAt={a["codebeamer.evidence.item.retrievedAt"]} failure={a["codebeamer.evidence.item.failure"]} />
        <EvidenceCard label="Relations" status={relationStatus} count={a["codebeamer.evidence.relations.count"]} retrievedAt={a["codebeamer.evidence.relations.retrievedAt"]} failure={a["codebeamer.evidence.relations.failure"]} />
        <EvidenceCard label="Attachments" status={attachmentStatus} count={a["codebeamer.evidence.attachments.count"]} retrievedAt={a["codebeamer.evidence.attachments.retrievedAt"]} failure={a["codebeamer.evidence.attachments.failure"]} />
        <EvidenceCard label="Catalog snapshot" status={catalogStatus} retrievedAt={a["codebeamer.catalogSynchronizedAt"]} />
      </div>
    </section>
  </>;
}
