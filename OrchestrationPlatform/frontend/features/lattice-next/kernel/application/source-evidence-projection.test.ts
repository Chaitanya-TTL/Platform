import { describe, expect, it } from "vitest";
import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceEntity,
  IntelligenceProperty,
  IntelligenceSourceFieldMetadata,
} from "../../contracts/intelligence-v1";
import {
  asCorrelationId,
  asExecutionId,
  asInvestigationId,
  type SourceOperationKind,
} from "../contracts/investigation-identity";
import type { InvestigationSnapshot } from "../contracts/investigation-snapshot";
import type { SourceOperationStatus } from "../contracts/source-operation";
import { projectSourceEvidence } from "./source-evidence-projection";

const capturedAt = "2026-11-18T10:00:00Z";
const assembledAt = "2026-11-19T10:00:00Z";
const temporal = { assembledAt, capturedAt, freshness: "current" as const };
type Source = NonNullable<EngineeringProvenance["source"]>;
type SnapshotOptions = {
  revision?: number;
  lifecycle?: InvestigationSnapshot["lifecycle"];
  completeness?: "complete" | "partial" | "failed" | "pending";
  sourceStatuses?: Partial<Record<Source, "available" | "partial" | "unavailable" | "failed">>;
  operationStatuses?: Partial<Record<Source, SourceOperationStatus>>;
  archivedAt?: string;
};

function text(value: string): IntelligenceProperty {
  return { type: "text", text: value };
}

function entity(
  id: string,
  source: Source,
  kind: string,
  properties: IntelligenceEntity["properties"],
  options: {
    authority?: EngineeringProvenance["authority"];
    freshness?: "current" | "stale" | "unknown" | "not-applicable";
    nativeId?: string;
    nativeRevision?: string;
  } = {},
): IntelligenceEntity {
  return {
    id,
    kind,
    displayName: `Synthetic ${kind}`,
    identityQuality: "native",
    assertion: "fact",
    properties,
    provenance: {
      source,
      provider: `${source}-synthetic-fixture`,
      nativeId: options.nativeId ?? `native-${id}`,
      nativeRevision: options.nativeRevision ?? "R7",
      artifactReference: id,
      observedAt: capturedAt,
      authority: options.authority ?? "source-authoritative",
    },
    temporal: { ...temporal, freshness: options.freshness ?? "current" },
  };
}

function lineagedEntity(
  id: string,
  source: Source,
  kind: string,
  properties: IntelligenceEntity["properties"],
  options: Parameters<typeof entity>[4] = {},
): IntelligenceEntity {
  const result = entity(id, source, kind, properties, options);
  result.sourceFieldMetadata = Object.fromEntries(
    Object.entries(properties).flatMap(([propertyName, property]) => {
      if (property.type !== "text" || typeof property.text !== "string") return [];
      const metadata: IntelligenceSourceFieldMetadata = {
        sourceValue: property.text,
        sourceFieldName: propertyName,
        candidateId: `${id}:${propertyName}`,
        sourceProvenance: { ...result.provenance },
        sourceAuthority: "source-authoritative",
        citationIds: [`cite:evidence:native-${id}:${propertyName}`],
        citationLinkageOrigin: "source-extraction",
        observedAt: capturedAt,
        capturedAt,
        freshness: options.freshness ?? "current",
      };
      return [[propertyName, [metadata]]];
    }),
  );
  return result;
}

function snapshot(
  entities: IntelligenceEntity[],
  options: SnapshotOptions = {},
): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const investigationId = asInvestigationId("investigation-42");
  const revision = options.revision ?? 7;
  const sources = [...new Set(entities.map((item) => item.provenance.source).filter(
    (source): source is Source => Boolean(source),
  ))];
  const sourceStatuses = options.sourceStatuses ?? {};
  const operationStatuses = options.operationStatuses ?? {};
  const canonical: EngineeringIntelligenceInvestigationV1 = {
    contractVersion: "1.0",
    investigationId,
    subject: {
      id: "synthetic-subject",
      displayName: "Synthetic subject",
      candidateIds: [],
      confidence: "verified",
      reasons: [],
      provenance: {
        provider: "synthetic-fixture",
        observedAt: assembledAt,
        authority: "backend-derived",
      },
      temporal,
    },
    entities,
    relationships: [],
    evidence: [],
    findings: [],
    sources: sources.map((source) => ({
      entityId: entities.find((item) => item.provenance.source === source)!.id,
      source,
      status: sourceStatuses[source] ?? "available",
      provenance: entities.find((item) => item.provenance.source === source)!.provenance,
    })),
    identityClusters: [],
    temporal,
    summary: {
      entityCount: entities.length,
      relationshipCount: 0,
      evidenceCount: 0,
      findingCount: 0,
      availableSourceCount: sources.length,
      partialSourceCount: 0,
      status: options.completeness === "partial" ? "partial" : "success",
    },
  };
  const operations: SourceOperationKind[] = ["resolve-structure", "gather-intelligence"];
  const executions = Object.fromEntries(
    sources.flatMap((source) => operations.map((operation) => [
      `${source}:${operation}`,
      {
        identity: {
          investigationId,
          revision,
          executionEpoch: 1,
          executionId: asExecutionId(`exec-${source}-${operation}`),
          correlationId: asCorrelationId(`corr-${source}-${operation}`),
          source,
          operation,
          attempt: 1,
        },
        status: operationStatuses[source] ?? "succeeded",
        capturedAt,
        freshness: "current" as const,
        warnings: [],
      },
    ])),
  );
  const overall = options.completeness ?? "complete";
  return {
    identity: { investigationId, revision, executionEpoch: 1 },
    lifecycle: options.lifecycle ?? (overall === "partial" ? "partial" : "ready"),
    subjectLabel: "Synthetic subject",
    query: "Synthetic fixture query",
    selections: sources.map((source) => ({
      source,
      nativeId: `native-${source}`,
      displayName: `Synthetic ${source}`,
    })),
    executions,
    acceptedEvidenceIds: [],
    completeness: {
      overall,
      requestedSources: sources,
      successfulSources: sources.filter((source) => sourceStatuses[source] !== "partial"),
      partialSources: sources.filter((source) => sourceStatuses[source] === "partial"),
      failedSources: sources.filter((source) => sourceStatuses[source] === "failed"),
      pendingSources: [],
      limitations: [],
    },
    canonical: { revision, publishedAt: assembledAt, value: canonical },
    warnings: [],
    createdAt: assembledAt,
    updatedAt: assembledAt,
    archivedAt: options.archivedAt,
  };
}

describe("projectSourceEvidence", () => {
  it("projects every source-lineaged text field across represented applications", () => {
    const sources: Source[] = ["codebeamer", "configit", "sap", "teamcenter", "windchill"];
    const result = projectSourceEvidence(snapshot(sources.map((source) =>
      lineagedEntity(
        `${source}-record`,
        source,
        "source-record",
        { description: text(`Synthetic ${source} authored text.`) },
      ),
    )));

    expect(result.records.map((record) => record.sourceApplication).sort()).toEqual([...sources].sort());
    expect(result.records).toHaveLength(sources.length);
    for (const record of result.records) {
      expect(record.searchableText).toContain(record.sourceApplication);
      expect(record.evidenceIds).toEqual([record.recordId]);
      expect(record.sourceFieldName).toBe("description");
      expect(record.citationIds).toEqual([`cite:evidence:${record.sourceRecordId}:description`]);
      expect(record.authority).toBe("source-authoritative");
    }
  });

  it("keeps identifier-only source values and reports candidates missing field lineage", () => {
    const identified = lineagedEntity("identified", "sap", "material", {
      materialId: text("MAT-123"),
    });
    const unlineaged = entity("unlineaged", "sap", "material", {
      description: text("Synthetic text without field-level provenance."),
    });

    const result = projectSourceEvidence(snapshot([identified, unlineaged]));

    expect(result.records.map((record) => record.searchableText)).toEqual(["MAT-123"]);
    expect(result.diagnostics.excludedByReason.missingFieldLineage).toBeGreaterThan(0);
  });

  it("projects only source-specific descriptive fields from the accepted snapshot shape", () => {
    const result = projectSourceEvidence(snapshot([
      entity("windchill-spec", "windchill", "requirement", {
        recordKind: text("specification"),
        description: text("Synthetic specification summary."),
        number: text("SPEC-123"),
      }),
      entity("codebeamer-req", "codebeamer", "requirement", {
        description: text("Synthetic requirement description."),
        "codebeamer.description": text("Synthetic requirement description."),
      }),
      entity("configit-rule", "configit", "configuration-rule", {
        expression: text("temperature <= 72 °C"),
        enabled: { type: "boolean", boolean: true },
      }),
      entity("configit-translation", "configit", "localization-translation", {
        sourceText: text("Synthetic source label"),
        translatedText: text("Synthetic translated label"),
      }),
      entity("sap-field", "sap", "sap-field", {
        recordKind: text("sap-field"),
        value: text("Synthetic source field value"),
      }),
      entity("codebeamer-detail", "codebeamer", "requirement-detail", {
        fieldKey: text("description"),
        presentationRole: text("description"),
        value: text("Synthetic requirement description."),
      }),
    ], {
      completeness: "partial",
      sourceStatuses: { codebeamer: "partial" },
      operationStatuses: { codebeamer: "partial" },
    }));

    expect(result.schemaVersion).toBe("1.0");
    expect(result.records.map(({ sourceApplication, recordType, searchableText }) => [
      sourceApplication,
      recordType,
      searchableText,
    ])).toEqual([
      ["windchill", "requirement", "Synthetic specification summary."],
      ["codebeamer", "requirement", "Synthetic requirement description."],
      ["configit", "configuration-rule", "temperature <= 72 °C"],
      ["configit", "localization-translation", "Synthetic translated label"],
    ]);
    expect(result.records.map((record) => record.location)).toEqual([
      "entities/windchill-spec/properties/description",
      "entities/codebeamer-req/properties/description",
      "entities/configit-rule/properties/expression",
      "entities/configit-translation/properties/translatedText",
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain("Synthetic");
  });

  it("preserves source identifiers and diagnoses non-source or unlineaged fields", () => {
    const missingIdentity = entity("missing-native-id", "windchill", "requirement", {
      recordKind: text("requirement"),
      description: text("Synthetic text without source identity."),
    });
    missingIdentity.provenance.nativeId = undefined;
    const missingProvenance = entity("missing-provenance", "windchill", "requirement", {
      recordKind: text("requirement"),
      description: text("Synthetic text without source provenance."),
    });
    missingProvenance.provenance.source = undefined;

    const result = projectSourceEvidence(snapshot([
      entity("generated", "windchill", "requirement", {
        recordKind: text("requirement"),
        description: text("Synthetic generated summary."),
      }, { authority: "backend-derived" }),
      entity("graph-derived", "windchill", "impact-chain", {
        summary: text("Synthetic graph-derived impact chain."),
      }, { authority: "frontend-derived" }),
      entity("identifier", "windchill", "requirement", {
        recordKind: text("requirement"),
        description: text("REQ-123"),
      }),
      entity("no-kind", "windchill", "requirement", {
        description: text("Synthetic description without a record kind."),
      }),
      entity("custom", "codebeamer", "requirement", {
        "codebeamer.custom.Internal Notes": text("Synthetic custom field."),
      }),
      entity("detail", "codebeamer", "requirement-detail", {
        fieldKey: text("description"),
        presentationRole: text("description"),
        value: text("Synthetic duplicate description."),
      }),
      entity("sap-generic", "sap", "sap-field", {
        value: text("Synthetic generic SAP field."),
      }),
      missingIdentity,
      missingProvenance,
    ]));

    expect(result.records.map((record) => record.searchableText)).toEqual(["REQ-123"]);
    expect(result.diagnostics.excludedByReason).toMatchObject({
      nonSourceAuthority: 2,
      missingNativeIdentity: 1,
      missingSourceApplication: 1,
    });
  });

  it("preserves partial source status independently from freshness and retains stale records", () => {
    const result = projectSourceEvidence(snapshot([
      entity("partial-current", "codebeamer", "requirement", {
        description: text("Synthetic Codebeamer description."),
      }),
      entity("stale-windchill", "windchill", "requirement", {
        recordKind: text("requirement"),
        description: text("Synthetic stale Windchill description."),
      }, { freshness: "stale" }),
    ], {
      completeness: "partial",
      sourceStatuses: { codebeamer: "partial" },
      operationStatuses: { codebeamer: "partial" },
    }));
    const codebeamer = result.records.find((record) => record.sourceApplication === "codebeamer")!;
    const windchill = result.records.find((record) => record.sourceApplication === "windchill")!;

    expect(result.snapshotLifecycle).toBe("partial");
    expect(result.snapshotCompleteness).toBe("partial");
    expect(codebeamer.freshness).toBe("current");
    expect(codebeamer.schemaVersion).toBe("1.0");
    expect(codebeamer.sourceExtractionStatuses).toEqual(["partial"]);
    expect(codebeamer.sourceOperations.map(({ operation, status }) => [operation, status])).toEqual([
      ["gather-intelligence", "partial"],
      ["resolve-structure", "partial"],
    ]);
    expect(windchill.freshness).toBe("stale");
    expect(windchill.capturedAt).toBe(capturedAt);
  });

  it("derives stable record IDs from source identity and field location, not text or snapshot revision", () => {
    const baseEntity = entity("codebeamer-req", "codebeamer", "requirement", {
      description: text("Synthetic description."),
    });
    const first = projectSourceEvidence(snapshot([baseEntity]));
    const sameContentAtNewSnapshotRevision = projectSourceEvidence(snapshot([baseEntity], { revision: 8 }));
    const changedSourceRevision = projectSourceEvidence(snapshot([
      entity("codebeamer-req", "codebeamer", "requirement", {
        description: text("Synthetic description."),
      }, { nativeRevision: "R8" }),
    ]));
    const changedText = projectSourceEvidence(snapshot([
      entity("codebeamer-req", "codebeamer", "requirement", {
        description: text("Updated synthetic description."),
      }),
    ]));

    expect(sameContentAtNewSnapshotRevision.records[0].recordId).toBe(first.records[0].recordId);
    expect(changedSourceRevision.records[0].recordId).not.toBe(first.records[0].recordId);
    expect(changedText.records[0].recordId).toBe(first.records[0].recordId);
    expect(changedText.records[0].contentHash).not.toBe(first.records[0].contentHash);
  });

  it("does not project unaccepted, archived, or revision-mismatched snapshots", () => {
    const input = snapshot([
      entity("windchill-req", "windchill", "requirement", {
        recordKind: text("requirement"),
        description: text("Synthetic description."),
      }),
    ]);
    const archived = projectSourceEvidence({ ...input, archivedAt: assembledAt });
    const refreshing = projectSourceEvidence({ ...input, lifecycle: "refreshing" });
    const mismatchedRevision = projectSourceEvidence({
      ...input,
      canonical: { ...input.canonical!, revision: input.identity.revision + 1 },
    });

    expect(archived.records).toEqual([]);
    expect(refreshing.records).toEqual([]);
    expect(mismatchedRevision.records).toEqual([]);
  });

  it("does not derive tenant metadata from the investigation ID", () => {
    const [record] = projectSourceEvidence(snapshot([
      entity("codebeamer-req", "codebeamer", "requirement", {
        description: text("Synthetic description."),
      }),
    ])).records;

    expect(record.tenantId).toBeUndefined();
    expect(record.investigationId).toBe("investigation-42");
    expect(record.tenantId).not.toBe(record.investigationId);
  });
});
