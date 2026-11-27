import type {
  ApplicationParticipationCandidateV1,
  FactAdapterDiagnosticV1,
  FactAdapterOmissionV1,
  GenericFactV1,
  SourceCoverageStatementV1,
} from "../../contracts/factual-evidence-v1";
import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import { codebeamerRequirementFactAdapter } from "./codebeamer-requirement-adapter";
import { configitFactSourceAdapterV1 } from "./configit-fact-adapter";
import { windchillPartFactAdapter } from "./windchill-part-fact-adapter";
import type { GenericFactSourceAdapterV1 } from "./source-fact-adapter";
import { mapMetadataBackedFacts } from "./metadata-backed-fact-adapter";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import {
  isAcceptedSnapshot,
  projectSourceEvidence,
} from "../../kernel/application/source-evidence-projection";
import { projectSourceFieldLineage } from "../../kernel/application/source-field-lineage";

const FACT_ADAPTERS: readonly GenericFactSourceAdapterV1[] = [
  codebeamerRequirementFactAdapter,
  configitFactSourceAdapterV1,
  windchillPartFactAdapter,
];

export interface StructuredFactProjectionBatch {
  schemaVersion: "1.0";
  investigationId: string;
  snapshotRevision: number;
  snapshotLifecycle: InvestigationSnapshot["lifecycle"];
  snapshotCompleteness: InvestigationSnapshot["completeness"]["overall"];
  facts: readonly GenericFactV1[];
  sourceCoverage: readonly SourceCoverageStatementV1[];
  diagnostics: readonly FactAdapterDiagnosticV1[];
  omissions: readonly FactAdapterOmissionV1[];
}

const factCompleteness = (
  completeness: InvestigationSnapshot["completeness"]["overall"],
): GenericFactV1["completeness"] =>
  completeness === "complete" || completeness === "partial" ? completeness : "unknown";

export function projectStructuredFacts(
  snapshot: InvestigationSnapshot<unknown>,
): StructuredFactProjectionBatch {
  const revision = snapshot.canonical?.revision ?? snapshot.identity.revision;
  const result: StructuredFactProjectionBatch = {
    schemaVersion: "1.0",
    investigationId: String(snapshot.identity.investigationId),
    snapshotRevision: revision,
    snapshotLifecycle: snapshot.lifecycle,
    snapshotCompleteness: snapshot.completeness.overall,
    facts: [],
    sourceCoverage: [],
    diagnostics: [],
    omissions: [],
  };

  if (!isAcceptedSnapshot(snapshot)) {
    const reason = "The snapshot is not the current accepted canonical investigation revision.";
    return {
      ...result,
      diagnostics: [{
        code: "snapshot-not-accepted",
        message: reason,
      }],
      omissions: [{
        scope: { investigationId: result.investigationId },
        reasonCode: "snapshot-not-accepted",
        reason,
        citationIds: [],
      }],
    };
  }

  const canonical = projectSourceFieldLineage(
    snapshot.canonical.value,
    result.investigationId,
  );
  const projectedSnapshot = {
    ...snapshot,
    canonical: { ...snapshot.canonical, value: canonical },
  };
  const sourceEvidence = projectSourceEvidence(projectedSnapshot);
  const generatedEvidence = sourceEvidence.records
    .filter((record) => record.citationIds.includes(record.recordId))
    .flatMap((record) => {
      const entity = canonical.entities.find((candidate) =>
        record.canonicalEntityIds.includes(candidate.id));
      const candidate = entity
        ? Object.values(entity.sourceFieldMetadata ?? {})
            .flat()
            .find((field) => field.citationIds?.includes(record.recordId))
        : undefined;
      if (!entity || !candidate?.sourceProvenance) return [];
      return [{
        id: record.recordId,
        kind: "source-field",
        summary: record.searchableText,
        source: record.sourceApplication,
        provenance: candidate.sourceProvenance,
        temporal: entity.temporal,
        fieldId: `metadata.${record.sourceApplication}.${candidate.nativeRecordKind ?? entity.kind}.${record.sourceFieldName}`,
        sourceFieldName: record.sourceFieldName,
      }];
    });
  const acceptedEvidenceIds = new Set([
    ...snapshot.acceptedEvidenceIds,
    ...generatedEvidence.map((evidence) => evidence.id),
  ]);
  const existingEvidenceIds = new Set(canonical.evidence.map((evidence) => evidence.id));
  const investigation: EngineeringIntelligenceInvestigationV1 = {
    ...canonical,
    evidence: [
      ...canonical.evidence.filter((evidence) => acceptedEvidenceIds.has(evidence.id)),
      ...generatedEvidence.filter((evidence) => !existingEvidenceIds.has(evidence.id)),
    ],
  };
  const facts: GenericFactV1[] = [];
  const sourceCoverage: SourceCoverageStatementV1[] = [];
  const diagnostics: FactAdapterDiagnosticV1[] = [];
  const omissions: FactAdapterOmissionV1[] = [];

  for (const adapter of FACT_ADAPTERS) {
    const hasSourceEntities = canonical.entities.some(
      (entity) => entity.provenance.source === adapter.sourceApplication,
    );
    if (!hasSourceEntities) continue;

    const mapped = adapter.map({ investigation });
    facts.push(...mapped.facts.map((fact) => {
      const evidenceIds = "evidence" in fact.provenance
        ? fact.provenance.evidence.map((evidence) => evidence.id)
        : fact.evidenceIds ?? [];
      const sourceEntity = canonical.entities.find((entity) =>
        entity.id === fact.sourceEntityId);
      const matchingCandidates = sourceEntity
        ? Object.values(sourceEntity.sourceFieldMetadata ?? {})
            .flat()
            .filter((candidate) =>
              candidate.sourceFieldName === fact.sourceFieldName &&
              JSON.stringify(candidate.sourceValue) === JSON.stringify(fact.exactSourceValue))
        : [];
      const fieldEvidenceIds = sourceEvidence.records
        .filter((record) =>
          record.sourceApplication === fact.sourceApplication &&
          record.sourceFieldName === fact.sourceFieldName &&
          record.canonicalEntityIds.includes(fact.sourceEntityId) &&
          matchingCandidates.some((candidate) =>
            candidate.citationIds?.includes(record.recordId)))
        .map((record) => record.recordId);
      return {
        ...fact,
        investigationRevision: revision,
        evidenceIds: [...new Set([
          ...evidenceIds.filter((evidenceId) => acceptedEvidenceIds.has(evidenceId)),
          ...fieldEvidenceIds,
        ])],
        citationIds: [...new Set([...fact.citationIds, ...fieldEvidenceIds])],
        citationEligible: fact.citationEligible || fieldEvidenceIds.length > 0,
      };
    }));
    sourceCoverage.push(...mapped.sourceCoverage);
    diagnostics.push(...mapped.diagnostics);
    omissions.push(...mapped.omissions);
  }

  const metadataBacked = mapMetadataBackedFacts(investigation, facts, sourceCoverage);
  facts.push(...metadataBacked.facts);
  sourceCoverage.push(...metadataBacked.sourceCoverage);
  diagnostics.push(...metadataBacked.diagnostics);
  omissions.push(...metadataBacked.omissions);

  return {
    ...result,
    facts: facts.sort((left, right) => left.factId.localeCompare(right.factId)),
    sourceCoverage: sourceCoverage.sort((left, right) =>
      `${left.sourceApplication}:${left.sourceEntityId ?? ""}`.localeCompare(
        `${right.sourceApplication}:${right.sourceEntityId ?? ""}`,
      ),
    ),
    diagnostics,
    omissions,
  };
}

export function projectApplicationParticipation(
  snapshot: InvestigationSnapshot<unknown>,
): readonly ApplicationParticipationCandidateV1[] {
  if (!isAcceptedSnapshot(snapshot)) return [];

  const canonical = projectSourceFieldLineage(
    snapshot.canonical.value,
    String(snapshot.identity.investigationId),
  );
  const projectedSnapshot = {
    ...snapshot,
    canonical: { ...snapshot.canonical, value: canonical },
  };
  const sourceEvidence = projectSourceEvidence(projectedSnapshot);
  const acceptedEvidenceIds = new Set(snapshot.acceptedEvidenceIds);
  const candidates: ApplicationParticipationCandidateV1[] = [];

  for (const entity of canonical.entities) {
    const fieldCandidates = Object.values(entity.sourceFieldMetadata ?? {}).flat();
    const provenance = entity.provenance.nativeId
      ? entity.provenance
      : fieldCandidates.find((candidate) =>
          candidate.sourceAuthority === "source-authoritative" &&
          candidate.sourceProvenance?.source === entity.provenance.source &&
          candidate.sourceProvenance?.nativeId)?.sourceProvenance ?? entity.provenance;
    const source = provenance.source;
    if (!source || !provenance.nativeId) {
      continue;
    }

    const evidence = canonical.evidence.filter((item) =>
      acceptedEvidenceIds.has(item.id) &&
      item.source === source &&
      item.provenance.artifactReference === entity.id,
    );
    const sourceRecords = sourceEvidence.records.filter((record) =>
      record.canonicalEntityIds.includes(entity.id));
    const operations = Object.values(snapshot.executions).filter(
      (execution) => execution.identity.source === source,
    );
    const participationOperations = operations.length ? operations : [undefined];

    for (const execution of participationOperations) {
      const sourceOperation = execution?.identity.operation ?? "not-observed";
      const sourceOperationStatus = execution?.status ?? "not-observed";
      const evidenceIds = [...new Set([
        ...evidence.map((item) => item.id),
        ...sourceRecords.flatMap((record) => record.evidenceIds),
      ])];
      const citationIds = [...new Set([
        ...evidence.map((item) => item.id),
        ...sourceRecords.map((record) => record.recordId),
      ])];
      candidates.push({
        contractVersion: "1.0",
        candidateId: [
          "participation",
          encodeURIComponent(String(snapshot.identity.investigationId)),
          source,
          encodeURIComponent(entity.id),
          encodeURIComponent(sourceOperation),
          String(snapshot.canonical.revision),
        ].join(":"),
        investigationId: String(snapshot.identity.investigationId),
        snapshotRevision: snapshot.canonical.revision,
        sourceApplication: source,
        canonicalEntityIds: [entity.id],
        sourceOperation,
        sourceOperationStatus,
        completeness: factCompleteness(snapshot.completeness.overall),
        ...(execution?.capturedAt ? { capturedAt: execution.capturedAt } : {}),
        evidenceIds,
        citationIds,
        citationEligible: evidenceIds.length > 0,
        sourceAuthority: provenance.authority,
        provenance,
      });
    }
  }

  return candidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}
