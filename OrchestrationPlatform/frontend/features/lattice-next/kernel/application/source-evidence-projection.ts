import { createHash } from "node:crypto";
import { isEngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceEntity,
  IntelligenceAuthority,
  SourceExtractionStatus,
} from "../../contracts/intelligence-v1";
import type {
  InvestigationLifecycle,
} from "../contracts/investigation-lifecycle";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type {
  SourceOperationKind,
} from "../contracts/investigation-identity";
import type { SourceOperationStatus } from "../contracts/source-operation";
import {
  projectSourceFieldLineage,
  sourceFieldEvidenceRecordId,
} from "./source-field-lineage";

type Source = NonNullable<EngineeringProvenance["source"]>;
type Freshness = NonNullable<IntelligenceEntity["temporal"]["freshness"]>;
type SnapshotWithEngineeringCanonical =
  InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> & {
    canonical: NonNullable<
      InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>["canonical"]
    >;
  };

export interface SourceEvidenceOperationStatus {
  operation: SourceOperationKind;
  status: SourceOperationStatus;
  freshness?: "current" | "stale" | "unknown";
  capturedAt?: string;
}

export interface SourceEvidenceProjection {
  schemaVersion: "1.0";
  recordId: string;
  tenantId?: string;
  investigationId: string;
  snapshotRevision: number;
  sourceApplication: Source;
  sourceRecordId: string;
  canonicalEntityIds: readonly string[];
  recordType: string;
  title: string;
  sourceFieldName: string;
  searchableText: string;
  location: string;
  sourceRevision?: string;
  sourceTimestamp?: string;
  capturedAt?: string;
  effectiveAt?: string;
  validFrom?: string;
  validTo?: string;
  freshness: Freshness;
  snapshotLifecycle: InvestigationLifecycle;
  snapshotCompleteness: "complete" | "partial" | "failed" | "pending";
  sourceExtractionStatuses: readonly SourceExtractionStatus[];
  sourceOperations: readonly SourceEvidenceOperationStatus[];
  contentHash: string;
  evidenceIds: readonly string[];
  citationIds: readonly string[];
  provenanceId: string;
  authority: "source-authoritative";
  deepLink?: string;
}

export interface SourceEvidenceProjectionDiagnostics {
  canonicalEntityCount: number;
  projectedRecordCount: number;
  projectedRecordsBySource: Readonly<Record<string, number>>;
  excludedByReason: Readonly<Record<string, number>>;
  sourceOperationStatusCounts: Readonly<Record<string, number>>;
}

export interface SourceEvidenceProjectionBatch {
  schemaVersion: "1.0";
  investigationId: string;
  snapshotRevision: number;
  snapshotLifecycle: InvestigationLifecycle;
  snapshotCompleteness: "complete" | "partial" | "failed" | "pending";
  records: readonly SourceEvidenceProjection[];
  diagnostics: SourceEvidenceProjectionDiagnostics;
}

interface SourceFieldCandidate {
  fieldKey: string;
  sourceFieldName?: string;
  sourceValue?: unknown;
  sourceAuthority?: IntelligenceAuthority;
  sourceProvenance?: EngineeringProvenance;
  candidateId?: string;
  citationIds?: readonly string[];
  observedAt?: string;
  extractedAt?: string;
  capturedAt?: string;
  effectiveAt?: string;
  validFrom?: string;
  validTo?: string;
  freshness?: Freshness;
}

const exclusionReasons = [
  "snapshotNotAccepted",
  "fieldNotAllowlisted",
  "nonSourceAuthority",
  "metadataMismatch",
  "fieldNotPresent",
  "nonTextField",
  "emptyText",
  "missingFieldLineage",
  "missingFieldProvenance",
  "missingSourceApplication",
  "duplicateFieldCandidate",
  "missingNativeIdentity",
] as const;

type ExclusionReason = (typeof exclusionReasons)[number];

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceValueText(value: unknown): string {
  if (typeof value === "string") return value.length ? value : '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

function hasEngineeringCanonical(
  snapshot: InvestigationSnapshot<unknown>,
): snapshot is SnapshotWithEngineeringCanonical {
  return Boolean(
    snapshot.canonical &&
    isEngineeringIntelligenceInvestigationV1(snapshot.canonical.value),
  );
}

export function isAcceptedSnapshot(
  snapshot: InvestigationSnapshot<unknown>,
): snapshot is SnapshotWithEngineeringCanonical {
  if (!hasEngineeringCanonical(snapshot)) return false;
  const canonical = snapshot.canonical;
  return Boolean(
    canonical &&
    !snapshot.archivedAt &&
    (snapshot.lifecycle === "ready" || snapshot.lifecycle === "partial") &&
    canonical.revision === snapshot.identity.revision &&
    canonical.value.investigationId === snapshot.identity.investigationId,
  );
}

function sourceFieldCandidates(entity: IntelligenceEntity): SourceFieldCandidate[] {
  const metadataCandidates = Object.entries(entity.sourceFieldMetadata ?? {})
    .flatMap(([fieldKey, candidates]) =>
      candidates.map((candidate) => ({
        ...candidate,
        fieldKey: `sourceFieldMetadata/${fieldKey}`,
      })));
  const metadataKeys = new Set(metadataCandidates.map((candidate) => JSON.stringify([
    candidate.sourceFieldName,
    candidate.candidateId,
    candidate.sourceProvenance?.nativeId,
    candidate.sourceProvenance?.nativeRevision,
  ])));
  const propertyCandidates = Object.entries(entity.properties).flatMap(([fieldKey, property]) => {
    if (!property.sourceFieldName &&
        property.sourceAuthority === undefined &&
        property.sourceProvenance === undefined &&
        property.sourceValue === undefined) {
      return [];
    }

    const identity = JSON.stringify([
      property.sourceFieldName,
      property.candidateId,
      property.sourceProvenance?.nativeId,
      property.sourceProvenance?.nativeRevision,
    ]);
    if (metadataKeys.has(identity)) return [];

    return [{
      ...property,
      fieldKey: `properties/${fieldKey}`,
      sourceValue: property.sourceValue ??
        (property.type === "text" ? property.text : undefined),
    }];
  });
  return [...metadataCandidates, ...propertyCandidates];
}

function operationStatuses(
  snapshot: InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>,
  source: Source,
): SourceEvidenceOperationStatus[] {
  return Object.values(snapshot.executions)
    .filter((execution) => execution.identity.source === source)
    .map((execution) => ({
      operation: execution.identity.operation,
      status: execution.status,
      freshness: execution.freshness,
      capturedAt: execution.capturedAt,
    }))
    .sort((left, right) => left.operation.localeCompare(right.operation));
}

function recordExtractionStatuses(
  snapshot: InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>,
  source: Source,
): SourceExtractionStatus[] {
  return [...new Set(
    (snapshot.canonical?.value.sources ?? [])
      .filter((item) => item.source === source)
      .map((item) => item.status),
  )].sort();
}

function createDiagnostics(
  entities: readonly IntelligenceEntity[],
  records: readonly SourceEvidenceProjection[],
  excludedByReason: Record<ExclusionReason, number>,
  sourceOperations: readonly {
    source: string;
    operation: string;
    status: string;
  }[],
): SourceEvidenceProjectionDiagnostics {
  const projectedRecordsBySource: Record<string, number> = {};
  for (const record of records) {
    projectedRecordsBySource[record.sourceApplication] =
      (projectedRecordsBySource[record.sourceApplication] ?? 0) + 1;
  }

  const sourceOperationStatusCounts: Record<string, number> = {};
  for (const execution of sourceOperations) {
    const key = `${execution.source}:${execution.operation}:${execution.status}`;
    sourceOperationStatusCounts[key] = (sourceOperationStatusCounts[key] ?? 0) + 1;
  }

  return {
    canonicalEntityCount: entities.length,
    projectedRecordCount: records.length,
    projectedRecordsBySource,
    excludedByReason,
    sourceOperationStatusCounts,
  };
}

export function projectSourceEvidence(
  snapshot: InvestigationSnapshot<unknown>,
): SourceEvidenceProjectionBatch {
  const originalEntities = hasEngineeringCanonical(snapshot)
    ? snapshot.canonical.value.entities
    : [];
  const canonical = isAcceptedSnapshot(snapshot)
    ? projectSourceFieldLineage(
        snapshot.canonical.value,
        String(snapshot.identity.investigationId),
      )
    : undefined;
  const entities = canonical?.entities ?? originalEntities;
  const records: SourceEvidenceProjection[] = [];
  const excludedByReason = Object.fromEntries(
    exclusionReasons.map((reason) => [reason, 0]),
  ) as Record<ExclusionReason, number>;
  const sourceOperations = Object.values(snapshot.executions).map((execution) => ({
    source: execution.identity.source,
    operation: execution.identity.operation,
    status: execution.status,
  }));
  const snapshotRevision = snapshot.canonical?.revision ?? snapshot.identity.revision;

  if (!isAcceptedSnapshot(snapshot)) {
    excludedByReason.snapshotNotAccepted = entities.length || 1;
  } else {
    for (const entity of canonical!.entities) {
      const entitySource = entity.provenance?.source;
      if (!entitySource) {
        excludedByReason.missingSourceApplication++;
        continue;
      }

      const candidates = sourceFieldCandidates(entity);
      if (candidates.length === 0 &&
          entity.provenance.authority !== "source-authoritative") {
        excludedByReason.nonSourceAuthority++;
        continue;
      }
      if (candidates.length === 0) continue;

      const seenCandidates = new Set<string>();
      const recordIds = new Set<string>();
      for (const candidate of candidates) {
        const provenance = candidate.sourceProvenance;
        const source = provenance?.source;
        if (!candidate.sourceFieldName?.trim()) {
          excludedByReason.missingFieldLineage++;
          continue;
        }
        if (!provenance) {
          excludedByReason.missingFieldProvenance++;
          continue;
        }
        if (!source) {
          excludedByReason.missingSourceApplication++;
          continue;
        }
        if (candidate.sourceAuthority !== "source-authoritative" ||
            provenance.authority !== "source-authoritative") {
          excludedByReason.nonSourceAuthority++;
          continue;
        }
        if (!provenance.nativeId?.trim()) {
          excludedByReason.missingNativeIdentity++;
          continue;
        }
        if (candidate.sourceValue === undefined) {
          excludedByReason.fieldNotPresent++;
          continue;
        }
        const searchableText = sourceValueText(candidate.sourceValue);

        const candidateKey = JSON.stringify([
          candidate.sourceFieldName,
          candidate.candidateId,
          provenance.nativeId,
          provenance.nativeRevision,
          candidate.sourceValue,
          candidate.citationIds,
        ]);
        if (seenCandidates.has(candidateKey)) {
          excludedByReason.duplicateFieldCandidate++;
          continue;
        }
        seenCandidates.add(candidateKey);

        const location = `entities/${entity.id}/${candidate.fieldKey}`;
        const provenanceIdentity = [
          source,
          provenance.provider,
          provenance.nativeId,
          provenance.nativeRevision ?? "",
          provenance.sourceExecutionId ?? "",
          provenance.artifactReference ?? "",
          candidate.sourceFieldName,
          candidate.candidateId ?? "",
        ];
        let recordId = sourceFieldEvidenceRecordId(
          String(snapshot.identity.investigationId),
          entity.id,
          candidate.fieldKey,
          provenance,
          candidate.candidateId,
        );
        if (recordIds.has(recordId)) {
          recordId = `${recordId}:${digest(candidateKey)}`;
        }
        recordIds.add(recordId);
        records.push({
          schemaVersion: "1.0",
          recordId,
          investigationId: String(snapshot.identity.investigationId),
          snapshotRevision,
          sourceApplication: source,
          sourceRecordId: provenance.nativeId,
          canonicalEntityIds: [entity.id],
          recordType: entity.kind,
          title: entity.displayName?.trim() ? entity.displayName : provenance.nativeId,
          sourceFieldName: candidate.sourceFieldName,
          searchableText,
          location,
          sourceRevision: provenance.nativeRevision,
          sourceTimestamp: candidate.observedAt ?? provenance.observedAt,
          capturedAt: candidate.capturedAt ?? entity.temporal?.capturedAt,
          effectiveAt: candidate.effectiveAt ?? entity.temporal?.effectiveAt,
          validFrom: candidate.validFrom ?? entity.temporal?.validFrom,
          validTo: candidate.validTo ?? entity.temporal?.validTo,
          freshness: candidate.freshness ?? entity.temporal?.freshness ?? "unknown",
          snapshotLifecycle: snapshot.lifecycle,
          snapshotCompleteness: snapshot.completeness.overall,
          sourceExtractionStatuses: recordExtractionStatuses(snapshot, source),
          sourceOperations: operationStatuses(snapshot, source),
          contentHash: `sha256:${digest(searchableText)}`,
          evidenceIds: [recordId],
          citationIds: candidate.citationIds?.length ? candidate.citationIds : [recordId],
          provenanceId: `sha256:${digest(JSON.stringify(provenanceIdentity))}`,
          authority: "source-authoritative",
        });
      }
    }
  }

  const lifecycle = snapshot.lifecycle;
  const completeness = snapshot.completeness.overall;
  return {
    schemaVersion: "1.0",
    investigationId: String(snapshot.identity.investigationId),
    snapshotRevision,
    snapshotLifecycle: lifecycle,
    snapshotCompleteness: completeness,
    records,
    diagnostics: createDiagnostics(
      entities,
      records,
      excludedByReason,
      sourceOperations,
    ),
  };
}
