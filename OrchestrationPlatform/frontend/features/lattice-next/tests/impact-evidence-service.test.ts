import { describe, expect, it, vi } from "vitest";
import type { InvestigationSnapshot } from "../kernel/contracts/investigation-snapshot";
import type { InvestigationKnowledgeGraph } from "../plm-brain/contracts/relationship-ontology";
import { createImpactEvidenceService } from "../plm-brain/universal/impact-evidence-service";
import type { ImpactEvidenceAuthorization } from "../plm-brain/universal/impact-evidence-authorization";

vi.mock("server-only", () => ({}));

const authorization: ImpactEvidenceAuthorization = {
  tenantId: "tenant-1",
  subjectId: "subject-1",
  decisionId: "decision-1",
  requestId: "request-1",
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
};

const graph = {
  schemaVersion: "1.0",
  ontologyVersion: "ontology-v7",
  investigationId: "investigation-1",
  snapshotRevision: 42,
  ontology: {} as InvestigationKnowledgeGraph["ontology"],
  entities: [
    {
      id: "part-canonical-1",
      kind: "Part",
      application: "windchill",
      label: "Bracket",
      nativeId: "BR-100",
      citationId: "citation-entity-1",
      provenance: { provider: "windchill", authority: "source-authoritative", observedAt: "2026-11-17T10:00:00Z", freshness: "current" },
    },
    {
      id: "part-canonical-2",
      kind: "Part",
      application: "sap",
      label: "Assembly",
      nativeId: "AS-200",
      citationId: "citation-entity-2",
      provenance: { provider: "sap", authority: "source-authoritative", observedAt: "2026-11-17T10:00:00Z", freshness: "current" },
    },
  ],
  canonicalRelationships: [],
  resolvedRelationships: [{
    id: "relationship-9",
    definitionId: "definition-1",
    evidenceRuleId: "rule-1",
    sourceEntityId: "part-canonical-1",
    targetEntityId: "part-canonical-2",
    forwardType: "contains",
    forwardMeaning: "The bracket contains the assembly.",
    inverseType: "contained-by",
    inverseMeaning: "The assembly is contained by the bracket.",
    status: "CONFIRMED",
    strength: "STRONG",
    mechanism: "source evidence",
    impactTraversal: true,
    evidence: [{
      id: "evidence-1",
      citationId: "citation-1",
      application: "windchill",
      entityId: "part-canonical-1",
      path: "structure.children",
      value: "AS-200",
      provider: "windchill-adapter",
      observedAt: "2026-11-17T10:00:00Z",
      authority: "source-authoritative",
      mappingId: "mapping-1",
    }],
    evidenceIds: ["evidence-1"],
    canonicalRelationshipIds: ["canonical-rel-1"],
    citationIds: ["citation-1"],
    provenance: {
      authority: "source-authoritative",
      provider: "windchill-adapter",
      ontologyVersion: "ontology-v7",
      observedAt: "2026-11-17T10:00:00Z",
      snapshotRevision: 42,
    },
  }, {
    id: "relationship-10",
    definitionId: "definition-2",
    evidenceRuleId: "rule-2",
    sourceEntityId: "part-canonical-2",
    targetEntityId: "part-canonical-1",
    forwardType: "references",
    forwardMeaning: "The assembly references the bracket.",
    inverseType: "referenced-by",
    inverseMeaning: "The bracket is referenced by the assembly.",
    status: "CONFIRMED",
    strength: "STRONG",
    mechanism: "source evidence",
    impactTraversal: false,
    evidence: [{
      id: "evidence-2",
      citationId: "citation-2",
      application: "sap",
      entityId: "part-canonical-2",
      path: "reference.part",
      value: "BR-100",
      provider: "sap-adapter",
      observedAt: "2026-11-17T10:00:00Z",
      authority: "source-authoritative",
      mappingId: "mapping-2",
    }],
    evidenceIds: ["evidence-2"],
    canonicalRelationshipIds: ["canonical-rel-2"],
    citationIds: ["citation-2"],
    provenance: {
      authority: "source-authoritative",
      provider: "sap-adapter",
      ontologyVersion: "ontology-v7",
      observedAt: "2026-11-17T10:00:00Z",
      snapshotRevision: 42,
    },
  }],
  unresolvedEvaluations: [],
  relationshipPaths: [],
  impactPaths: [{
    id: "path-11",
    sourceEntityId: "part-canonical-1",
    targetEntityId: "part-canonical-2",
    relationshipIds: ["relationship-9"],
    steps: [{
      relationshipId: "relationship-9",
      fromEntityId: "part-canonical-1",
      toEntityId: "part-canonical-2",
      traversal: "forward",
      type: "contains",
      meaning: "The bracket contains the assembly.",
    }],
    meanings: ["The bracket contains the assembly."],
    status: "CONFIRMED",
    strength: "STRONG",
    impactEligible: true,
    citationIds: ["citation-1"],
  }],
  impactChains: [{
    id: "chain-5",
    sourceEntityId: "part-canonical-1",
    impactedEntityId: "part-canonical-2",
    relationshipIds: ["relationship-9"],
    relationshipSequence: [{
      relationshipId: "relationship-9",
      fromEntityId: "part-canonical-1",
      toEntityId: "part-canonical-2",
      traversal: "forward",
      type: "contains",
      meaning: "The bracket contains the assembly.",
    }],
    supportingEvidenceIds: ["evidence-1"],
    citationIds: ["citation-1"],
    engineeringExplanation: "Authoritative explanation.",
    confidence: 0.92,
    impactRationale: "Authoritative rationale.",
    status: "CONFIRMED",
    strength: "STRONG",
  }],
  knowledgeGraphSummary: {
    entityCount: 2,
    relationshipCount: 2,
    impactPathCount: 1,
    evidenceCount: 1,
    applicationCoverage: {},
    ontologyVersion: "ontology-v7",
    maxTraversalDepth: 3,
  },
  relationshipEvidence: [{
    id: "evidence-1",
    citationId: "citation-1",
    application: "windchill",
    entityId: "part-canonical-1",
    path: "structure.children",
    value: "AS-200",
    provider: "windchill-adapter",
    observedAt: "2026-11-17T10:00:00Z",
    authority: "source-authoritative",
  }, {
    id: "evidence-2",
    citationId: "citation-2",
    application: "sap",
    entityId: "part-canonical-2",
    path: "reference.part",
    value: "BR-100",
    provider: "sap-adapter",
    observedAt: "2026-11-17T10:00:00Z",
    authority: "source-authoritative",
  }],
  crossApplicationMappings: [],
  traversalIndexes: { outgoing: {}, incoming: {} },
  confidenceMetadata: {
    entityCount: 2,
    relationshipCount: 1,
    unresolvedCount: 0,
    relationshipCoverage: 1,
    maxTraversalDepth: 3,
  },
} as InvestigationKnowledgeGraph;

const snapshot = {
  identity: { investigationId: "investigation-1", revision: 42 },
  canonical: {
    revision: 42,
    publishedAt: "2026-11-17T10:00:00Z",
    value: {
      contractVersion: "1.0",
      investigationId: "investigation-1",
      entities: [],
      relationships: [],
      evidence: [],
      findings: [],
      sources: [],
      identityClusters: [],
      knowledgeGraph: graph,
    },
  },
} as unknown as InvestigationSnapshot;

describe("private PLM impact evidence service", () => {
  it("resolves exact canonical/native IDs only inside the requested investigation", async () => {
    const loadSnapshot = vi.fn(async (_id: string) => snapshot);
    const service = createImpactEvidenceService(loadSnapshot, (value) => value);

    const result = await service.resolveEntity("investigation-1", "BR-100", authorization);

    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot.mock.calls[0][0]).toBe("investigation-1");
    expect(result.disposition).toBe("Resolved");
    expect(result.entity?.canonicalId).toBe("part-canonical-1");
    expect(result.requestId).toBe(authorization.requestId);
    expect(result.traceId).toBe(authorization.traceId);
  });

  it("returns existing path/chain IDs, provenance, source version, and ontology version unchanged", async () => {
    const service = createImpactEvidenceService(async () => snapshot, (value) => value);

    const evidence = await service.retrieveImpactEvidence(
      "investigation-1",
      "part-canonical-1",
      { relationshipTypes: [], maxHops: 3, sourceSystems: [], asOf: null },
      authorization,
    );

    expect(evidence.paths.map((path) => path.id)).toEqual(["path-11"]);
    expect(evidence.chains.map((chain) => chain.id)).toEqual(["chain-5"]);
    expect(evidence.chains[0].engineeringExplanation).toBe("Authoritative explanation.");
    expect(evidence.relationships.map((relationship) => relationship.id)).toEqual(["relationship-9"]);
    expect(evidence.sources[0]).toMatchObject({
      evidenceId: "evidence-1",
      citationId: "citation-1",
      provider: "windchill-adapter",
      authority: "source-authoritative",
      provenanceId: "evidence-1",
      authorizationDecisionId: "decision-1",
    });
    expect(evidence.sourceVersion).toBe("42");
    expect(evidence.ontologyVersion).toBe("ontology-v7");
  });

  it("retrieves investigation-wide relationships and sources without requiring a graph subject", async () => {
    const service = createImpactEvidenceService(async () => snapshot, (value) => value);

    const evidence = await service.retrieveInvestigationEvidence("investigation-1", authorization);

    expect(evidence.relationships.map((relationship) => relationship.id)).toEqual([
      "relationship-9",
      "relationship-10",
    ]);
    expect(evidence.sources.map((source) => source.evidenceId)).toEqual(["evidence-1", "evidence-2"]);
    expect(evidence.paths.map((path) => path.id)).toEqual(["path-11"]);
    expect(evidence.chains.map((chain) => chain.id)).toEqual(["chain-5"]);
    expect(evidence.authorizationDecisionId).toBe(authorization.decisionId);
  });

  it("does not resolve an entity by substring or load another investigation", async () => {
    const loadSnapshot = vi.fn(async (_id: string) => snapshot);
    const service = createImpactEvidenceService(loadSnapshot, (value) => value);

    const result = await service.resolveEntity("investigation-1", "BR-10", authorization);

    expect(result.disposition).toBe("Unresolved");
    expect(loadSnapshot.mock.calls[0][0]).toBe("investigation-1");
  });
});
