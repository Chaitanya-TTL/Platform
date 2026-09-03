import { NextRequest, NextResponse } from "next/server";
import { legacyHandoffToIntelligence } from "@/features/lattice-next/engines/legacy-handoff-to-intelligence";
import type { LatticeHandoff } from "@/features/lattice-next/contracts/handoff";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceRelationship } from "@/features/lattice-next/contracts/intelligence-v1";
import type { WindchillRequirementsResponse } from "@/types/windchill-requirements";
import type { WindchillVersionList, WindchillRevisionComparisonResult } from "@/types/windchill-revision";
import type { WindchillChangeImpactResult } from "@/types/windchill-change-impact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = { handoff: LatticeHandoff };
type CallResult<T> = { ok: true; value: T } | { ok: false; message: string };
const property = (text: unknown) => ({ type: "text", text: text == null ? undefined : String(text) } as const);
const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function call<T>(origin: string, path: string, signal: AbortSignal): Promise<CallResult<T>> {
  try {
    const response = await fetch(`${origin}${path}`, { cache: "no-store", signal });
    const value = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: value?.error ?? value?.message ?? `${response.status} ${response.statusText}` };
    return { ok: true, value: value as T };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Windchill operation failed." };
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as RequestBody;
  if (!body?.handoff?.sources?.length) return NextResponse.json({ code: "invalid-handoff", message: "A valid investigation handoff is required." }, { status: 400 });
  const windchill = body.handoff.sources.find((source) => source.source === "windchill");
  if (!windchill) return NextResponse.json(legacyHandoffToIntelligence(body.handoff));

  const canonical = legacyHandoffToIntelligence(body.handoff);
  const observedAt = new Date().toISOString();
  const nativeId = windchill.nativeId ?? windchill.root.id;
  const queryType = /^OR:wt\.part\.WTPart:\d+$/i.test(nativeId) ? "part-oid" : /^\d+$/.test(nativeId) ? "part-number" : "part-name";
  const query = queryType === "part-name" ? body.handoff.subjectLabel : nativeId;
  const encodedId = encodeURIComponent(nativeId);
  const encodedQuery = encodeURIComponent(query);
  const origin = request.nextUrl.origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const [requirements, versions, impact] = await Promise.all([
      call<WindchillRequirementsResponse>(origin, `/api/bom-windchill?operation=requirements&queryType=${queryType}&query=${encodedQuery}`, controller.signal),
      call<WindchillVersionList>(origin, `/api/bom-windchill?operation=versions&partId=${encodedId}`, controller.signal),
      call<WindchillChangeImpactResult>(origin, `/api/bom-windchill?operation=change-impact&partId=${encodedId}`, controller.signal),
    ]);

    let comparison: CallResult<WindchillRevisionComparisonResult> = { ok: false, message: "Fewer than two revisions are available." };
    if (versions.ok && versions.value.versions.length >= 2) {
      const ordered = [...versions.value.versions];
      const from = ordered[ordered.length - 2];
      const to = ordered.find((version) => version.latest) ?? ordered[ordered.length - 1];
      comparison = await call<WindchillRevisionComparisonResult>(origin, `/api/bom-windchill?operation=compare&partId=${encodedId}&from=${encodeURIComponent(from.label)}&to=${encodeURIComponent(to.label)}`, controller.signal);
    }

    const entities: IntelligenceEntity[] = [...canonical.entities];
    const relationships: IntelligenceRelationship[] = [...canonical.relationships];
    const evidence = [...canonical.evidence];
    const findings = [...canonical.findings];
    const sourceEntityId = canonical.sources.find((source) => source.source === "windchill")?.entityId ?? canonical.subject.id;
    const provenance = (provider: string, id?: string, authority: "source-authoritative" | "backend-derived" | "poc-synthetic" = "source-authoritative") => ({ source: "windchill", provider, nativeId: id, observedAt, authority });
    const temporal = { assembledAt: observedAt, capturedAt: observedAt, freshness: "current" } as const;
    const addEntity = (entity: IntelligenceEntity) => { if (!entities.some((item) => item.id === entity.id)) entities.push(entity); };
    const addRelationship = (relationship: IntelligenceRelationship) => { if (!relationships.some((item) => item.id === relationship.id)) relationships.push(relationship); };

    if (requirements.ok) {
      const authority = requirements.value.dataStatus === "poc-synthetic" ? "poc-synthetic" as const : "source-authoritative" as const;
      for (const specification of requirements.value.requirementSpecifications) {
        const specId = `windchill:requirement-specification:${safe(specification.id)}`;
        addEntity({ id: specId, kind: "requirement", displayName: specification.name, assertion: "fact", properties: { number: property(specification.number), revision: property(specification.revision), version: property(specification.version), status: property(specification.state), description: property(specification.description), recordKind: property("specification") }, provenance: provenance("bom-windchill:requirements", specification.id, authority), temporal });
        addRelationship({ id: `windchill:described-by:${safe(sourceEntityId)}:${safe(specId)}`, kind: "described-by", family: "requirement", sourceEntityId, targetEntityId: specId, assertion: "fact", confidence: "verified", evidenceIds: [], properties: {}, provenance: provenance("bom-windchill:requirements", specification.id, authority), temporal });
        const files = [specification.primaryContent, ...specification.attachments].filter(Boolean);
        for (const file of files) {
          const fileValue = file!;
          const evidenceId = `windchill:evidence:${safe(fileValue.id)}`;
          evidence.push({ id: evidenceId, kind: "document", summary: fileValue.fileName, source: "windchill", provenance: provenance("windchill-content", fileValue.id, authority), temporal });
        }
        for (const requirement of specification.requirements) {
          const requirementId = `windchill:requirement:${safe(requirement.id)}`;
          addEntity({ id: requirementId, kind: "requirement", displayName: requirement.name, assertion: "fact", properties: { number: property(requirement.number), requirementId: property(requirement.requirementId), revision: property(requirement.version), status: property(requirement.state), description: property(requirement.description), category: property(requirement.category), recordKind: property("requirement") }, provenance: provenance("bom-windchill:requirements", requirement.id, authority), temporal });
          addRelationship({ id: `windchill:contains-requirement:${safe(specId)}:${safe(requirementId)}`, kind: "contains", family: "requirement", sourceEntityId: specId, targetEntityId: requirementId, assertion: "fact", confidence: "verified", evidenceIds: [], properties: {}, provenance: provenance("bom-windchill:requirements", requirement.id, authority), temporal });
        }
      }
    }

    if (versions.ok) {
      const revisionIds = versions.value.versions.map((version) => {
        const id = `windchill:part-revision:${safe(version.partId)}:${safe(version.label)}`;
        addEntity({ id, kind: "change-task", displayName: `${version.name ?? body.handoff.subjectLabel} ${version.display}`, assertion: "fact", properties: { revision: property(version.revision), version: property(version.label), latest: { type: "boolean", boolean: version.latest }, number: property(version.number), view: property(version.view), recordKind: property("part-revision") }, provenance: provenance("bom-windchill:versions", version.partId), temporal });
        return id;
      });
      for (let index = 1; index < revisionIds.length; index += 1) addRelationship({ id: `windchill:supersedes:${safe(revisionIds[index])}:${safe(revisionIds[index - 1])}`, kind: "supersedes", family: "change", sourceEntityId: revisionIds[index], targetEntityId: revisionIds[index - 1], assertion: "fact", confidence: "verified", evidenceIds: [], properties: {}, provenance: provenance("bom-windchill:versions"), temporal });
    }

    if (impact.ok) {
      for (const notice of impact.value.changeNotices) {
        const noticeNativeId = notice.id ?? notice.number ?? notice.name ?? crypto.randomUUID();
        const noticeId = `windchill:change-notice:${safe(noticeNativeId)}`;
        addEntity({ id: noticeId, kind: "change-notice", displayName: notice.name ?? notice.number ?? "Windchill change notice", assertion: "fact", properties: { number: property(notice.number), status: property(notice.state), description: property(notice.descriptionSummary ?? notice.description), createdOn: property(notice.createdOn), resolutionDate: property(notice.resolutionDate), affectedParts: { type: "number", number: notice.affectedParts.length }, recordKind: property("change-notice") }, provenance: provenance("bom-windchill:change-impact", noticeNativeId), temporal });
        addRelationship({ id: `windchill:affected-by:${safe(sourceEntityId)}:${safe(noticeId)}`, kind: "affected-by", family: "change", sourceEntityId, targetEntityId: noticeId, assertion: "fact", confidence: "verified", evidenceIds: [], properties: {}, provenance: provenance("bom-windchill:change-impact", noticeNativeId), temporal });
        for (const task of notice.tasks) {
          const taskId = `windchill:change-task:${safe(task.id)}`;
          addEntity({ id: taskId, kind: "change-task", displayName: task.name ?? task.number ?? "Windchill change task", assertion: "fact", properties: { number: property(task.number), status: property(task.state), description: property(task.description), resolutionDate: property(task.resolutionDate), recordKind: property("change-task") }, provenance: provenance("bom-windchill:change-impact", task.id), temporal });
          addRelationship({ id: `windchill:implements:${safe(noticeId)}:${safe(taskId)}`, kind: "implements", family: "change", sourceEntityId: noticeId, targetEntityId: taskId, assertion: "fact", confidence: "verified", evidenceIds: [], properties: {}, provenance: provenance("bom-windchill:change-impact", task.id), temporal });
        }
      }
    }

    if (comparison.ok) {
      for (const change of comparison.value.changes.filter((item) => item.status !== "unchanged")) {
        const evidenceId = `windchill:revision-difference:${safe(change.itemId)}:${safe(change.status)}`;
        evidence.push({ id: evidenceId, kind: "revision-difference", summary: `${change.status}: ${change.itemId}`, source: "windchill", provenance: provenance("bom-windchill:compare", change.itemId, "backend-derived"), temporal });
      }
    }

    const warnings = [requirements, versions, impact, comparison].filter((item) => !item.ok).map((item) => !item.ok ? item.message : "");
    if (warnings.length) findings.push({ id: `windchill:finding:partial:${safe(nativeId)}`, kind: "incomplete-extraction", title: "Windchill intelligence is partially available", summary: warnings.join(" | "), subjectEntityIds: [canonical.subject.id], evidenceIds: [], provenance: provenance("windchill-investigation", nativeId, "backend-derived"), temporal });

    const result: EngineeringIntelligenceInvestigationV1 = { ...canonical, subject: { ...canonical.subject, reasons: [...canonical.subject.reasons, "Windchill structure, requirements, versions, revision comparison and change-impact APIs reused"], provenance: provenance("windchill-platform-api-investigation", nativeId, "backend-derived"), temporal }, entities, relationships, evidence, findings, temporal, summary: { ...canonical.summary, entityCount: entities.length, relationshipCount: relationships.length, evidenceCount: evidence.length, findingCount: findings.length, status: warnings.length ? "partial-success" : "success" } };
    return NextResponse.json(result);
  } finally {
    clearTimeout(timer);
  }
}
