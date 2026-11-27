import { describe, expect, it, vi } from "vitest";
import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceEntity,
} from "../../contracts/intelligence-v1";
import { isEngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import {
  asCorrelationId,
  asExecutionId,
  asInvestigationId,
} from "../../kernel/contracts/investigation-identity";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { SourceOperationStatus } from "../../kernel/contracts/source-operation";
import { ensureInvestigationKnowledgeGraph } from "../../plm-brain/universal/ensure-investigation-knowledge-graph";
import {
  projectApplicationParticipation,
  projectStructuredFacts,
} from "./structured-fact-projection";
import { createFactualEvidenceService } from "./factual-evidence-service";

vi.mock("server-only", () => ({}));

const capturedAt = "2026-11-18T10:00:00Z";
const assembledAt = "2026-11-19T10:00:00Z";
const investigationId = asInvestigationId("investigation-42");
const sourceProvenance: EngineeringProvenance = {
  source: "codebeamer",
  provider: "codebeamer-synthetic-fixture",
  nativeId: "REQ-42",
  nativeRevision: "R7",
  artifactReference: "codebeamer-req-42",
  observedAt: capturedAt,
  authority: "source-authoritative",
};

function sourceEntity(): IntelligenceEntity {
  return {
    id: "codebeamer-req-42",
    kind: "requirement",
    displayName: "Synthetic requirement",
    identityQuality: "native",
    assertion: "fact",
    properties: {},
    sourceFieldMetadata: {
      title: [{
        sourceValue: " Exact source title ",
        sourceFieldName: "requirement.name",
        sourceTransformations: [{
          ruleId: "trim-display",
          ruleVersion: "1",
          operation: "display-normalization",
          reversible: true,
        }],
        candidateId: "title-candidate-1",
        displayValue: "Exact source title",
        sourceProvenance,
        sourceAuthority: "source-authoritative",
        observedAt: capturedAt,
        extractedAt: assembledAt,
        effectiveAt: "2026-11-18T00:00:00Z",
        validFrom: "2026-11-18T00:00:00Z",
        validTo: "2026-12-18T00:00:00Z",
        freshness: "current",
        completeness: "partial",
        citationIds: ["evidence-42"],
        sourceScope: {
          revision: "R7",
          dimensions: [{
            dimensionId: "configuration",
            label: "Configuration",
            exactValue: "US",
            valueType: "text",
          }],
        },
      }],
    },
    provenance: sourceProvenance,
    temporal: { assembledAt, capturedAt, freshness: "current" },
  };
}

function snapshot(options: {
  revision?: number;
  canonicalRevision?: number;
  lifecycle?: InvestigationSnapshot["lifecycle"];
  completeness?: InvestigationSnapshot["completeness"]["overall"];
  operationStatus?: SourceOperationStatus;
  acceptedEvidenceIds?: readonly string[];
  selectedNativeId?: string;
} = {}): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const revision = options.revision ?? 7;
  const entity = sourceEntity();
  const temporal = { assembledAt, capturedAt, freshness: "current" as const };
  const canonical: EngineeringIntelligenceInvestigationV1 = {
    contractVersion: "1.0",
    investigationId,
    subject: {
      id: "subject-42",
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
    entities: [entity],
    relationships: [],
    evidence: [{
      id: "evidence-42",
      kind: "source-field",
      summary: "Synthetic field evidence",
      source: "codebeamer",
      provenance: {
        ...sourceProvenance,
        artifactReference: entity.id,
      },
      temporal,
    }],
    findings: [],
    sources: [{
      entityId: entity.id,
      source: "codebeamer",
      status: "partial",
      provenance: sourceProvenance,
    }],
    identityClusters: [],
    temporal,
    summary: {
      entityCount: 1,
      relationshipCount: 0,
      evidenceCount: 1,
      findingCount: 0,
      availableSourceCount: 0,
      partialSourceCount: 1,
      status: "partial",
    },
  };
  const operationStatus = options.operationStatus ?? "partial";
  const executionIdentity = {
    investigationId,
    revision,
    executionEpoch: 1,
    executionId: asExecutionId("exec-codebeamer-gather"),
    correlationId: asCorrelationId("corr-codebeamer-gather"),
    source: "codebeamer",
    operation: "gather-intelligence",
    attempt: 1,
  } as const;

  return {
    identity: { investigationId, revision, executionEpoch: 1 },
    lifecycle: options.lifecycle ?? "partial",
    subjectLabel: "Synthetic subject",
    query: "Synthetic fixture query",
    selections: [{
      source: "codebeamer",
      nativeId: options.selectedNativeId ?? "REQ-42",
      displayName: "Synthetic requirement",
    }],
    executions: {
      "codebeamer:gather-intelligence": {
        identity: executionIdentity,
        status: operationStatus,
        capturedAt,
        freshness: "current",
        warnings: [],
      },
    },
    acceptedEvidenceIds: options.acceptedEvidenceIds ?? ["evidence-42"],
    completeness: {
      overall: options.completeness ?? "partial",
      requestedSources: ["codebeamer"],
      successfulSources: [],
      partialSources: ["codebeamer"],
      failedSources: [],
      pendingSources: [],
      limitations: [],
    },
    canonical: {
      revision: options.canonicalRevision ?? revision,
      publishedAt: assembledAt,
      value: canonical,
    },
    warnings: [],
    createdAt: assembledAt,
    updatedAt: assembledAt,
  };
}

function windchillSnapshot(): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const base = snapshot();
  const canonicalSnapshot = base.canonical;
  if (!canonicalSnapshot) throw new Error("Fixture requires a canonical snapshot.");
  const provenance: EngineeringProvenance = {
    source: "windchill",
    provider: "windchill-synthetic-fixture",
    nativeId: "WT-PART-17",
    nativeRevision: "A",
    artifactReference: "windchill-part-17",
    observedAt: capturedAt,
    authority: "source-authoritative",
  };
  const entity: IntelligenceEntity = {
    ...sourceEntity(),
    id: "windchill-part-17",
    kind: "part",
    sourceFieldMetadata: {
      weight: [{
        sourceValue: { Value: 5.2, Unit: "kg" },
        sourceFieldName: "requirements.part.customAttributes.weight",
        candidateId: "weight-candidate-17",
        sourceProvenance: provenance,
        sourceAuthority: "source-authoritative",
        observedAt: capturedAt,
        freshness: "current",
        citationIds: ["evidence-17"],
        sourceScope: {
          revision: "A",
          dimensions: [{
            dimensionId: "plant",
            label: "Plant",
            exactValue: "plant-7",
            valueType: "identifier",
          }],
        },
        sourceAdapterMetadata: {
          adapterId: "windchill-part-facts",
          schemaVersion: "1.0",
          metadata: { representation: "value-unit-v1" },
        },
      }],
    },
    provenance,
  };
  const evidence = {
    id: "evidence-17",
    kind: "source-field",
    summary: "Synthetic weight evidence",
    source: "windchill",
    fieldId: "windchill.part.weight",
    sourceFieldName: "requirements.part.customAttributes.weight",
    provenance,
    temporal: { assembledAt, capturedAt, freshness: "current" as const },
  };
  const priorExecution = base.executions["codebeamer:gather-intelligence"];

  return {
    ...base,
    selections: [{
      source: "windchill",
      nativeId: "WT-PART-17",
      displayName: "Synthetic part",
    }],
    executions: {
      "windchill:gather-intelligence": {
        ...priorExecution,
        identity: { ...priorExecution.identity, source: "windchill" },
      },
    },
    acceptedEvidenceIds: ["evidence-17"],
    completeness: {
      ...base.completeness,
      requestedSources: ["windchill"],
      successfulSources: [],
      partialSources: ["windchill"],
    },
    canonical: {
      ...canonicalSnapshot,
      value: {
        ...canonicalSnapshot.value,
        entities: [entity],
        evidence: [evidence],
        sources: [{
          entityId: entity.id,
          source: "windchill",
          status: "partial",
          provenance,
        }],
      },
    },
  };
}

function configitSnapshot(): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const base = snapshot();
  const canonicalSnapshot = base.canonical;
  if (!canonicalSnapshot) throw new Error("Fixture requires a canonical snapshot.");
  const provenance: EngineeringProvenance = {
    source: "configit",
    provider: "configit-synthetic-fixture",
    nativeId: "PM-17",
    nativeRevision: "R2",
    artifactReference: "configit-product-model-17",
    observedAt: capturedAt,
    authority: "source-authoritative",
  };
  const entity: IntelligenceEntity = {
    ...sourceEntity(),
    id: "configit-product-model-17",
    kind: "product-model",
    sourceFieldMetadata: {
      description: [{
        sourceValue: "Product model description",
        sourceFieldName: "productModel.description",
        nativeRecordKind: "product-model",
        candidateId: "description-candidate-17",
        sourceProvenance: provenance,
        sourceAuthority: "source-authoritative",
        observedAt: capturedAt,
        freshness: "current",
        citationIds: ["evidence-configit-17"],
        sourceScope: {
          revision: "R2",
          dimensions: [{
            dimensionId: "product-line",
            label: "Product line",
            exactValue: "industrial",
            valueType: "text",
          }],
        },
      }],
    },
    provenance,
  };
  const evidence = {
    id: "evidence-configit-17",
    kind: "source-field",
    summary: "Synthetic product-model evidence",
    source: "configit",
    fieldId: "configit.product-model.description",
    sourceFieldName: "productModel.description",
    provenance,
    temporal: { assembledAt, capturedAt, freshness: "current" as const },
  };
  const priorExecution = base.executions["codebeamer:gather-intelligence"];

  return {
    ...base,
    selections: [{
      source: "configit",
      nativeId: "PM-17",
      displayName: "Synthetic product model",
    }],
    executions: {
      "configit:gather-intelligence": {
        ...priorExecution,
        identity: { ...priorExecution.identity, source: "configit" },
      },
    },
    acceptedEvidenceIds: ["evidence-configit-17"],
    canonical: {
      ...canonicalSnapshot,
      value: {
        ...canonicalSnapshot.value,
        entities: [entity],
        evidence: [evidence],
        sources: [{
          entityId: entity.id,
          source: "configit",
          status: "available",
          provenance,
        }],
      },
    },
  };
}

function sapSnapshot(): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const base = snapshot();
  const canonicalSnapshot = base.canonical;
  if (!canonicalSnapshot) throw new Error("Fixture requires a canonical snapshot.");
  const provenance: EngineeringProvenance = {
    source: "sap",
    provider: "sap-synthetic-fixture",
    nativeId: "000000000000000042",
    nativeRevision: "2026-11",
    artifactReference: "sap-material-42",
    observedAt: capturedAt,
    authority: "source-authoritative",
  };
  const entity: IntelligenceEntity = {
    ...sourceEntity(),
    id: "sap-material-42",
    kind: "material-master",
    sourceFieldMetadata: {
      stock: [{
        sourceValue: 0,
        sourceFieldName: "custom.stockAvailable",
        nativeRecordKind: "material-master",
        candidateId: "sap-stock-candidate-42",
        sourceProvenance: provenance,
        sourceAuthority: "source-authoritative",
        observedAt: capturedAt,
        freshness: "current",
        citationIds: ["evidence-sap-42"],
        sourceScope: {
          revision: "2026-11",
          dimensions: [{
            dimensionId: "plant",
            label: "Plant",
            exactValue: "1000",
            valueType: "identifier",
          }, {
            dimensionId: "unit",
            label: "Unit",
            exactValue: "EA",
            valueType: "text",
            unit: "EA",
          }],
        },
      }],
    },
    provenance,
  };
  const evidence = {
    id: "evidence-sap-42",
    kind: "source-field",
    summary: "Synthetic SAP stock evidence",
    source: "sap",
    sourceFieldName: "custom.stockAvailable",
    provenance: { ...provenance, artifactReference: entity.id },
    temporal: { assembledAt, capturedAt, freshness: "current" as const },
  };
  const priorExecution = base.executions["codebeamer:gather-intelligence"];

  return {
    ...base,
    selections: [{
      source: "sap",
      nativeId: "000000000000000042",
      displayName: "Synthetic material",
    }],
    executions: {
      "sap:gather-intelligence": {
        ...priorExecution,
        identity: { ...priorExecution.identity, source: "sap" },
      },
    },
    acceptedEvidenceIds: ["evidence-sap-42"],
    completeness: {
      ...base.completeness,
      requestedSources: ["sap"],
      successfulSources: ["sap"],
      partialSources: [],
    },
    canonical: {
      ...canonicalSnapshot,
      value: {
        ...canonicalSnapshot.value,
        entities: [entity],
        evidence: [evidence],
        sources: [{
          entityId: entity.id,
          source: "sap",
          status: "available",
          provenance,
        }],
      },
    },
  };
}

function crossSystemSnapshot(): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const snapshots = [snapshot(), configitSnapshot(), sapSnapshot(), windchillSnapshot()];
  const base = snapshots[0];
  if (!base.canonical) throw new Error("Fixture requires a canonical snapshot.");

  const canonicalValues = snapshots.map((item) => {
    if (!item.canonical) throw new Error("Fixture requires a canonical snapshot.");
    return item.canonical.value;
  });
  const acceptedEvidenceIds = snapshots.flatMap((item) => item.acceptedEvidenceIds);
  return {
    ...base,
    selections: snapshots.flatMap((item) => item.selections),
    executions: Object.assign({}, ...snapshots.map((item) => item.executions)),
    acceptedEvidenceIds,
    completeness: {
      ...base.completeness,
      requestedSources: ["codebeamer", "configit", "sap", "windchill"],
      successfulSources: ["codebeamer", "sap"],
      partialSources: ["configit", "windchill"],
    },
    canonical: {
      ...base.canonical,
      value: {
        ...base.canonical.value,
        entities: canonicalValues.flatMap((value) => value.entities),
        evidence: canonicalValues.flatMap((value) => value.evidence),
        sources: canonicalValues.flatMap((value) => value.sources),
      },
    },
  };
}

function rawSourcePropertySnapshot(): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  const base = snapshot();
  if (!base.canonical) throw new Error("Fixture requires a canonical snapshot.");

  const sourceEntity = (
    id: string,
    source: NonNullable<EngineeringProvenance["source"]>,
    kind: string,
    nativeId: string,
    properties: IntelligenceEntity["properties"],
  ): IntelligenceEntity => ({
    id,
    kind,
    displayName: `Synthetic ${kind}`,
    identityQuality: "native",
    assertion: "fact",
    properties,
    provenance: {
      source,
      provider: `${source}-raw-property-fixture`,
      nativeId,
      nativeRevision: "R7",
      artifactReference: id,
      observedAt: capturedAt,
      authority: "source-authoritative",
    },
    temporal: { assembledAt, capturedAt, freshness: "current" },
  });

  const entities = [
    sourceEntity("windchill-weight", "windchill", "physical-attribute", "WT-PART-17", {
      attributeKey: { type: "text", text: "weight" },
      value: { type: "text", text: "2.50 KG" },
    }),
    sourceEntity("configit-rule", "configit", "configuration-rule", "RULE-17", {
      expression: { type: "text", text: "if STYPE.LCSTYPE then not ORIENTATION.[05]" },
    }),
    sourceEntity("codebeamer-parent", "codebeamer", "requirement", "1187", {
      title: { type: "text", text: "Steering requirement" },
    }),
    sourceEntity("codebeamer-detail", "codebeamer", "requirement-detail", "1187", {
      ownerRequirementId: { type: "text", text: "codebeamer-parent" },
      fieldKey: { type: "text", text: "description" },
      value: { type: "text", text: "Steering system shall support the specified load." },
    }),
    sourceEntity("sap-stock", "sap", "inventory-balance", "MAT-42", {
      availableQuantity: { type: "number", number: 5000 },
      unit: { type: "text", text: "EA" },
    }),
  ];
  entities[3].provenance.nativeId = undefined;

  const sources = [...new Set(entities
    .map((entity) => entity.provenance.source)
    .filter((source): source is NonNullable<EngineeringProvenance["source"]> =>
      Boolean(source)))];
  const priorExecution = base.executions["codebeamer:gather-intelligence"];
  const executions = Object.fromEntries(sources.map((source) => [
    `${source}:gather-intelligence`,
    {
      ...priorExecution,
      identity: {
        ...priorExecution.identity,
        source,
        executionId: asExecutionId(`exec-${source}-gather`),
        correlationId: asCorrelationId(`corr-${source}-gather`),
      },
    },
  ]));

  return {
    ...base,
    executions,
    acceptedEvidenceIds: ["exec-windchill-gather", "exec-configit-gather"],
    completeness: {
      ...base.completeness,
      requestedSources: sources,
      successfulSources: sources,
      partialSources: [],
    },
    canonical: {
      ...base.canonical,
      value: {
        ...base.canonical.value,
        entities,
        evidence: [],
        sources: entities.map((entity) => ({
          entityId: entity.id,
          source: entity.provenance.source!,
          status: "available",
          provenance: entity.provenance,
        })),
        summary: {
          ...base.canonical.value.summary,
          entityCount: entities.length,
          evidenceCount: 0,
          availableSourceCount: sources.length,
        },
      },
    },
  };
}

describe("structured snapshot projection", () => {
  it("preserves exact fact values, lineage, dimensions, and accepted revision", () => {
    const input = snapshot();
    const result = projectStructuredFacts(input);

    expect(result.snapshotRevision).toBe(7);
    expect(result).toEqual(projectStructuredFacts(input));
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      investigationRevision: 7,
      exactSourceValue: " Exact source title ",
      normalizedValue: "Exact source title",
      displayLabel: "Title",
      fieldId: "requirement.title",
      sourceFieldName: "requirement.name",
      effectiveAt: "2026-11-18T00:00:00Z",
      validFrom: "2026-11-18T00:00:00Z",
      validTo: "2026-12-18T00:00:00Z",
      dimensions: [{
        dimensionId: "source-revision",
        exactValue: "R7",
      }],
      citationIds: expect.arrayContaining([
        "evidence-42",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationEligible: true,
      completeness: "partial",
      freshness: "current",
    });
    expect(result.facts[0].transformationTrace).toEqual([{
      ruleId: "trim-display",
      ruleVersion: "1",
      operation: "display-normalization",
      reversible: true,
    }]);
  });

  it("keeps Product 360 participation tied to source entities and operation evidence", () => {
    const input = snapshot();
    const candidates = projectApplicationParticipation(input);

    expect(candidates).toEqual(projectApplicationParticipation(input));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      sourceApplication: "codebeamer",
      canonicalEntityIds: ["codebeamer-req-42"],
      sourceOperation: "gather-intelligence",
      sourceOperationStatus: "partial",
      completeness: "partial",
      evidenceIds: expect.arrayContaining([
        "evidence-42",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationIds: expect.arrayContaining([
        "evidence-42",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationEligible: true,
    });
    expect(candidates[0]).not.toHaveProperty("authorizationDecisionId");
    expect(candidates[0]).not.toHaveProperty("relationships");
    expect(projectApplicationParticipation({ ...input, selections: [] })).toEqual(candidates);
  });

  it("preserves explicit Windchill quantity units and dimensions", () => {
    const result = projectStructuredFacts(windchillSnapshot());

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      exactSourceValue: { Value: 5.2, Unit: "kg" },
      unit: "kg",
      dimensions: [{
        dimensionId: "plant",
        exactValue: "plant-7",
      }],
      citationIds: expect.arrayContaining([
        "evidence-17",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationEligible: true,
    });
  });

  it("projects registered Configit facts with their source dimensions", () => {
    const result = projectStructuredFacts(configitSnapshot());

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      sourceApplication: "configit",
      exactSourceValue: "Product model description",
      fieldId: "configit.product-model.description",
      evidenceIds: expect.arrayContaining([
        "evidence-configit-17",
        expect.stringMatching(/^source-evidence:/),
      ]),
      dimensions: [{
        dimensionId: "product-line",
        exactValue: "industrial",
      }],
      citationIds: expect.arrayContaining([
        "evidence-configit-17",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationEligible: true,
    });
  });

  it("does not attribute source-field candidates without field-specific provenance", () => {
    const input = snapshot();
    const canonicalSnapshot = input.canonical;
    if (!canonicalSnapshot) throw new Error("Fixture requires a canonical snapshot.");
    const [entity] = canonicalSnapshot.value.entities;
    const field = entity.sourceFieldMetadata?.title?.[0];
    if (!field) throw new Error("Fixture requires source-field metadata.");
    const metadata = {
      ...field,
      sourceProvenance: undefined,
      sourceAuthority: undefined,
    };
    const unlineagedCustomField = {
      ...field,
      sourceFieldName: "tracker.customFields.unlineaged",
      candidateId: "unlineaged-custom-field",
      sourceProvenance: undefined,
      sourceAuthority: undefined,
    };
    const unauthoritativeCustomField = {
      ...field,
      sourceFieldName: "tracker.customFields.unauthoritative",
      candidateId: "unauthoritative-custom-field",
      sourceAuthority: undefined,
    };
    const changedEntity: IntelligenceEntity = {
      ...entity,
      sourceFieldMetadata: {
        title: [metadata],
        custom: [unlineagedCustomField],
        unauthoritative: [unauthoritativeCustomField],
      },
    };
    const changedSnapshot = {
      ...input,
      canonical: {
        ...canonicalSnapshot,
        value: { ...canonicalSnapshot.value, entities: [changedEntity] },
      },
    };

    const result = projectStructuredFacts(changedSnapshot);

    expect(result.facts).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "missing-provenance" }),
    );
    expect(result.omissions).toContainEqual(
      expect.objectContaining({ reasonCode: "missing-provenance" }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-provenance",
        sourceFieldName: "tracker.customFields.unlineaged",
      }),
    );
    expect(result.omissions).toContainEqual(
      expect.objectContaining({
        reasonCode: "missing-provenance",
        sourceFieldName: "tracker.customFields.unlineaged",
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "missing-source-authority",
        sourceFieldName: "tracker.customFields.unauthoritative",
      }),
    );
    expect(result.omissions).toContainEqual(
      expect.objectContaining({
        reasonCode: "missing-source-authority",
        sourceFieldName: "tracker.customFields.unauthoritative",
      }),
    );
  });

  it("retains operation status and cites source fields from the accepted canonical snapshot", () => {
    const input = snapshot({
      operationStatus: "empty",
      acceptedEvidenceIds: [],
    });
    const candidate = projectApplicationParticipation(input)[0];
    const fact = projectStructuredFacts(input).facts[0];

    expect(candidate.sourceOperationStatus).toBe("empty");
    expect(candidate.evidenceIds).toEqual([
      expect.stringMatching(/^source-evidence:/),
    ]);
    expect(candidate.citationIds).toEqual([
      expect.stringMatching(/^source-evidence:/),
    ]);
    expect(candidate.citationEligible).toBe(true);
    expect(fact.exactSourceValue).toBe(" Exact source title ");
    expect(fact.citationIds).toEqual([
      expect.stringMatching(/^source-evidence:/),
    ]);
    expect(fact.citationEligible).toBe(true);
  });

  it("does not project facts from an unaccepted snapshot revision", () => {
    const input = snapshot({ revision: 8, canonicalRevision: 7 });

    expect(projectStructuredFacts(input).facts).toEqual([]);
    expect(projectApplicationParticipation(input)).toEqual([]);
    expect(projectStructuredFacts(input).diagnostics).toContainEqual(
      expect.objectContaining({ code: "snapshot-not-accepted" }),
    );
  });

  it("projects an unregistered source field and does not duplicate registered facts", () => {
    const input = snapshot();
    const canonicalSnapshot = input.canonical;
    if (!canonicalSnapshot) throw new Error("Fixture requires a canonical snapshot.");
    const [entity] = canonicalSnapshot.value.entities;
    const sourceField = entity.sourceFieldMetadata?.title?.[0];
    if (!sourceField) throw new Error("Fixture requires source-field metadata.");
    const changedEntity: IntelligenceEntity = {
      ...entity,
      sourceFieldMetadata: {
        ...entity.sourceFieldMetadata,
        customWeight: [{
          ...sourceField,
          sourceValue: 17.4,
          sourceFieldName: "tracker.customFields.vehicleWeight",
          candidateId: "custom-weight-42",
          freshness: "stale",
          completeness: "complete",
          sourceScope: {
            revision: "R7",
            effectiveAt: "2026-11-18T00:00:00Z",
            validFrom: "2026-11-18T00:00:00Z",
            validTo: "2026-12-18T00:00:00Z",
            dimensions: [{
              dimensionId: "measurement-system",
              label: "Measurement system",
              exactValue: "metric",
              valueType: "text",
            }],
          },
        }],
      },
    };
    const changedSnapshot = {
      ...input,
      canonical: {
        ...canonicalSnapshot,
        value: { ...canonicalSnapshot.value, entities: [changedEntity] },
      },
    };

    const result = projectStructuredFacts(changedSnapshot);

    expect(result.facts).toHaveLength(2);
    expect(result.facts.filter((fact) => fact.fieldId === "requirement.title")).toHaveLength(1);
    expect(result.facts).toContainEqual(expect.objectContaining({
      sourceApplication: "codebeamer",
      exactSourceValue: 17.4,
      sourceValueType: "scalar",
      valueType: "scalar",
      fieldId: "metadata.codebeamer.requirement.tracker.customFields.vehicleWeight",
      sourceFieldName: "tracker.customFields.vehicleWeight",
      displayLabel: "tracker.customFields.vehicleWeight",
      dimensions: [{
        dimensionId: "measurement-system",
        label: "Measurement system",
        exactValue: "metric",
        valueType: "text",
      }],
      citationIds: expect.arrayContaining([
        "evidence-42",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationEligible: true,
      sourceAuthority: "source-authoritative",
      freshness: "stale",
      completeness: "complete",
    }));
    expect(result.facts.find((fact) =>
      fact.fieldId === "metadata.codebeamer.requirement.tracker.customFields.vehicleWeight",
    )?.provenance).toMatchObject({
      entity: {
        source: "codebeamer",
        nativeId: "REQ-42",
      },
      sourceFieldName: "tracker.customFields.vehicleWeight",
      candidateId: "custom-weight-42",
      sourceScope: {
        revision: "R7",
        effectiveAt: "2026-11-18T00:00:00Z",
        validFrom: "2026-11-18T00:00:00Z",
        validTo: "2026-12-18T00:00:00Z",
      },
    });
  });

  it("projects SAP fields from accepted source metadata without a static registry", () => {
    const result = projectStructuredFacts(sapSnapshot());

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      sourceApplication: "sap",
      sourceEntityId: "sap-material-42",
      sourceNativeId: "000000000000000042",
      nativeRecordKind: "material-master",
      exactSourceValue: 0,
      sourceValueType: "scalar",
      valueType: "scalar",
      fieldId: "metadata.sap.material-master.custom.stockAvailable",
      sourceFieldName: "custom.stockAvailable",
      displayLabel: "custom.stockAvailable",
      dimensions: [{
        dimensionId: "plant",
        exactValue: "1000",
      }, {
        dimensionId: "unit",
        exactValue: "EA",
        unit: "EA",
      }],
      citationIds: expect.arrayContaining([
        "evidence-sap-42",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationEligible: true,
    });
  });

  it("keeps field-level citations when operation-level evidence IDs do not match", () => {
    const input = sapSnapshot();
    const result = projectStructuredFacts({
      ...input,
      acceptedEvidenceIds: [],
    });

    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({
      exactSourceValue: 0,
      citationIds: [expect.stringMatching(/^source-evidence:/)],
      citationEligible: true,
    });
  });

  it("does not cite accepted evidence that names a different source field", () => {
    const input = sapSnapshot();
    const canonicalSnapshot = input.canonical;
    if (!canonicalSnapshot) throw new Error("Fixture requires a canonical snapshot.");
    const changedSnapshot = {
      ...input,
      canonical: {
        ...canonicalSnapshot,
        value: {
          ...canonicalSnapshot.value,
          evidence: canonicalSnapshot.value.evidence.map((evidence) => ({
            ...evidence,
            sourceFieldName: "custom.differentField",
          })),
        },
      },
    };

    const fact = projectStructuredFacts(changedSnapshot).facts[0];

    expect(fact.citationIds).toEqual([expect.stringMatching(/^source-evidence:/)]);
    expect(fact.citationEligible).toBe(true);
  });

  it("serves exact facts only from the accepted, request-bound snapshot provenance", async () => {
    const enriched = ensureInvestigationKnowledgeGraph(configitSnapshot());
    const canonical = enriched.canonical?.value;
    if (!isEngineeringIntelligenceInvestigationV1(canonical) || !canonical.knowledgeGraph) {
      throw new Error("Fixture requires a graph-bound accepted snapshot.");
    }

    const service = createFactualEvidenceService(async () => configitSnapshot());
    const response = await service.retrieveFacts(
      String(investigationId),
      {
        requested: true,
        linkedEntityIds: [],
        sourceApplications: ["configit"],
        fieldIds: ["configit.product-model.description"],
        exactIdentifiers: [],
        reasonCode: "exact-fact",
      },
      {
        sourceVersion: String(canonical.knowledgeGraph.snapshotRevision),
        ontologyVersion: canonical.knowledgeGraph.ontologyVersion,
      },
      { decisionId: "decision-42", requestId: "request-42", traceId: "trace-42" },
    );

    expect(response.evidence.facts).toHaveLength(1);
    expect(response.evidence.facts[0]).toMatchObject({
      exactSourceValue: "Product model description",
      sourceNativeId: "PM-17",
      evidenceIds: expect.arrayContaining([
        "evidence-configit-17",
        expect.stringMatching(/^source-evidence:/),
      ]),
      authorizationDecisionId: "decision-42",
      provenance: {
        source: "configit",
        nativeId: "PM-17",
      },
    });
    expect(response.evidence).toMatchObject({
      investigationId: String(investigationId),
      sourceVersion: String(canonical.knowledgeGraph.snapshotRevision),
      ontologyVersion: canonical.knowledgeGraph.ontologyVersion,
      authoritativeEntityIds: ["configit-product-model-17"],
      requestId: "request-42",
      traceId: "trace-42",
    });
  });

  it("rejects fact retrieval when the requested graph snapshot is stale", async () => {
    const service = createFactualEvidenceService(async () => configitSnapshot());

    await expect(service.retrieveFacts(
      String(investigationId),
      {
        requested: true,
        linkedEntityIds: [],
        sourceApplications: [],
        fieldIds: [],
        exactIdentifiers: [],
        reasonCode: "broad-overview",
      },
      { sourceVersion: "stale", ontologyVersion: "stale" },
      { decisionId: "decision-42", requestId: "request-42", traceId: "trace-42" },
    )).rejects.toMatchObject({ status: 409 });
  });

  it("applies explicit source identifiers without narrowing unrequested facts", async () => {
    const enriched = ensureInvestigationKnowledgeGraph(configitSnapshot());
    const canonical = enriched.canonical?.value;
    if (!isEngineeringIntelligenceInvestigationV1(canonical) || !canonical.knowledgeGraph) {
      throw new Error("Fixture requires a graph-bound accepted snapshot.");
    }

    const service = createFactualEvidenceService(async () => configitSnapshot());
    const response = await service.retrieveFacts(
      String(investigationId),
      {
        requested: true,
        linkedEntityIds: [],
        sourceApplications: [],
        fieldIds: [],
        exactIdentifiers: ["PM-17"],
        reasonCode: "exact-identifier",
      },
      {
        sourceVersion: String(canonical.knowledgeGraph.snapshotRevision),
        ontologyVersion: canonical.knowledgeGraph.ontologyVersion,
      },
      { decisionId: "decision-42", requestId: "request-42", traceId: "trace-42" },
    );

    expect(response.evidence.facts.map((fact) => fact.sourceNativeId)).toEqual(["PM-17"]);
  });

  it("serves selected-application participation with accepted evidence lineage", async () => {
    const enriched = ensureInvestigationKnowledgeGraph(configitSnapshot());
    const canonical = enriched.canonical?.value;
    if (!isEngineeringIntelligenceInvestigationV1(canonical) || !canonical.knowledgeGraph) {
      throw new Error("Fixture requires a graph-bound accepted snapshot.");
    }

    const service = createFactualEvidenceService(async () => configitSnapshot());
    const response = await service.retrieveApplicationContext(
      String(investigationId),
      {
        requested: true,
        linkedEntityIds: [],
        sourceApplications: ["configit"],
        reasonCode: "application-summary",
      },
      {
        sourceVersion: String(canonical.knowledgeGraph.snapshotRevision),
        ontologyVersion: canonical.knowledgeGraph.ontologyVersion,
      },
      { decisionId: "decision-42", requestId: "request-42", traceId: "trace-42" },
    );

    expect(response.evidence.participations).toHaveLength(1);
    expect(response.evidence.participations[0]).toMatchObject({
      sourceApplication: "configit",
      canonicalEntityIds: ["configit-product-model-17"],
      evidenceIds: expect.arrayContaining([
        "evidence-configit-17",
        expect.stringMatching(/^source-evidence:/),
      ]),
      citationIds: expect.arrayContaining([
        "evidence-configit-17",
        expect.stringMatching(/^source-evidence:/),
      ]),
      authorizationDecisionId: "decision-42",
    });
    expect(response.evidence.authoritativeEntityIds).toEqual(["configit-product-model-17"]);
  });

  it("serves broad cross-system facts and application participation from the full accepted snapshot", async () => {
    const acceptedSnapshot = crossSystemSnapshot();
    const enriched = ensureInvestigationKnowledgeGraph(acceptedSnapshot);
    const canonical = enriched.canonical?.value;
    if (!isEngineeringIntelligenceInvestigationV1(canonical) || !canonical.knowledgeGraph) {
      throw new Error("Fixture requires a graph-bound accepted snapshot.");
    }

    const service = createFactualEvidenceService(async () => acceptedSnapshot);
    const binding = {
      sourceVersion: String(canonical.knowledgeGraph.snapshotRevision),
      ontologyVersion: canonical.knowledgeGraph.ontologyVersion,
    };
    const authorization = {
      decisionId: "decision-42",
      requestId: "request-42",
      traceId: "trace-42",
    };
    const [factResponse, applicationResponse] = await Promise.all([
      service.retrieveFacts(
        String(investigationId),
        {
          requested: true,
          linkedEntityIds: [],
          sourceApplications: [],
          fieldIds: [],
          exactIdentifiers: [],
          reasonCode: "broad-overview",
        },
        binding,
        authorization,
      ),
      service.retrieveApplicationContext(
        String(investigationId),
        {
          requested: true,
          linkedEntityIds: [],
          sourceApplications: [],
          reasonCode: "broad-overview",
        },
        binding,
        authorization,
      ),
    ]);

    expect(new Set(factResponse.evidence.facts.map((fact) => fact.sourceApplication))).toEqual(
      new Set(["codebeamer", "configit", "sap", "windchill"]),
    );
    expect(new Set(applicationResponse.evidence.participations.map((item) => item.sourceApplication))).toEqual(
      new Set(["codebeamer", "configit", "sap", "windchill"]),
    );
  });

  it("serves exact raw source-property facts and citations from all four applications", async () => {
    const acceptedSnapshot = rawSourcePropertySnapshot();
    const enriched = ensureInvestigationKnowledgeGraph(acceptedSnapshot);
    const canonical = enriched.canonical?.value;
    if (!isEngineeringIntelligenceInvestigationV1(canonical) || !canonical.knowledgeGraph) {
      throw new Error("Fixture requires a graph-bound accepted snapshot.");
    }

    const service = createFactualEvidenceService(async () => acceptedSnapshot);
    const binding = {
      sourceVersion: String(canonical.knowledgeGraph.snapshotRevision),
      ontologyVersion: canonical.knowledgeGraph.ontologyVersion,
    };
    const authorization = {
      decisionId: "decision-42",
      requestId: "request-42",
      traceId: "trace-42",
    };
    const [factResponse, applicationResponse] = await Promise.all([
      service.retrieveFacts(
        String(investigationId),
        {
          requested: true,
          linkedEntityIds: [],
          sourceApplications: [],
          fieldIds: [],
          exactIdentifiers: [],
          reasonCode: "broad-overview",
        },
        binding,
        authorization,
      ),
      service.retrieveApplicationContext(
        String(investigationId),
        {
          requested: true,
          linkedEntityIds: [],
          sourceApplications: [],
          reasonCode: "broad-overview",
        },
        binding,
        authorization,
      ),
    ]);

    const expectedFacts = [
      ["windchill", "weight", "2.50 KG"],
      ["configit", "expression", "if STYPE.LCSTYPE then not ORIENTATION.[05]"],
      ["codebeamer", "description", "Steering system shall support the specified load."],
      ["sap", "availableQuantity", 5000],
      ["sap", "unit", "EA"],
    ] as const;
    for (const [source, fieldName, value] of expectedFacts) {
      expect(factResponse.evidence.facts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sourceApplication: source,
          sourceFieldName: fieldName,
          exactSourceValue: value,
          citationIds: expect.arrayContaining([expect.any(String)]),
          citationEligible: true,
        }),
      ]));
    }
    expect(new Set(applicationResponse.evidence.participations.map((item) => item.sourceApplication))).toEqual(
      new Set(["codebeamer", "configit", "sap", "windchill"]),
    );
    expect(applicationResponse.evidence.participations.every((item) =>
      item.evidenceIds.length > 0 && item.citationIds.length > 0)).toBe(true);
  });
});
