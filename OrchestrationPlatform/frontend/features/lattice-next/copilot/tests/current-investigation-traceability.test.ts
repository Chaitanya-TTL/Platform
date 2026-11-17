import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import { buildInvestigationContext, engineeringPromptPayload, ensureEngineeringAnswerCoverage } from "../context-builder";
import { ensureInvestigationKnowledgeGraph } from "../../plm-brain/universal/ensure-investigation-knowledge-graph";

vi.mock("server-only", () => ({}));

const investigationId = "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96";
const snapshotPath = resolve(process.cwd(), ".lattice-data", "investigations", investigationId, "snapshot.json");
const m1 = "Which applications are involved in this investigation and how are they connected?";
const m2 = "What operational consequence follows from this Windchill part being represented as a SAP material?";

describe.skipIf(!existsSync(snapshotPath))("current investigation subject-traceability prompt", () => {
  const savedSnapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as InvestigationSnapshot;
  const snapshot = ensureInvestigationKnowledgeGraph(savedSnapshot);

  it("keeps M1 application coverage compact within the default context budget", () => {
    const packet = buildInvestigationContext(snapshot, m1);
    const prompt = engineeringPromptPayload(m1, packet);
    if (!("engineeringBrief" in prompt)) throw new Error("M1 prompt projection is unavailable.");
    const summary = prompt.engineeringBrief;
    const sourceApps = new Set(
      (snapshot.canonical?.value as { entities?: Array<{ provenance?: { source?: string } }> } | undefined)
        ?.entities?.flatMap((entity) => entity.provenance?.source ? [entity.provenance.source.toLowerCase()] : []) ?? [],
    );
    const expectedApplications = ["Codebeamer", "SAP", "Windchill", "Configit"]
      .filter((application) => sourceApps.has(application.toLowerCase()));
    const applicationByEntity = new Map(packet.entities.map((entity) => [entity.entityId, entity.source]));
    const ontologyCrossSystemRelationships = summary.majorRelationships.filter((relationship) =>
      relationship.category === "ontology-resolved" &&
      applicationByEntity.get(relationship.sourceEntityId) !== applicationByEntity.get(relationship.targetEntityId),
    );

    expect(summary.applicationsPresent).toEqual(expect.arrayContaining(expectedApplications));
    const compactFourApplicationContext = expectedApplications.length === 4;
    expect(summary.subjectParticipationSummary).toEqual(compactFourApplicationContext ? "" : expect.any(String));
    expect(summary.crossSystemParticipationSummary).toMatch(/same Steering investigation subject/i);
    expect(packet.reasoningPackage.subjectTraceabilityRelationships).toHaveLength(0);
    expect(summary.subjectTraceabilityRelationships).toHaveLength(0);
    expect(packet.reasoningPackage.subjectTraceabilityNarratives.length)
      .toBe(compactFourApplicationContext ? 0 : expectedApplications.length);
    expect(summary.subjectTraceabilityNarratives)
      .toHaveLength(compactFourApplicationContext ? 0 : expectedApplications.length);
    expect(ontologyCrossSystemRelationships).toHaveLength(0);
    expect(packet.subjectTraceabilityDiagnostics.graphSubjectTraceabilityEdgeCount).toBeGreaterThan(
      packet.subjectTraceabilityDiagnostics.entityLevelSubjectEdgesIncludedInPrompt,
    );
    expect(packet.subjectTraceabilityDiagnostics.applicationParticipationSummaryCount).toBe(expectedApplications.length);
    expect(packet.subjectTraceabilityDiagnostics.entityLevelSubjectEdgesIncludedInPrompt).toBe(0);
    expect(packet.subjectTraceabilityDiagnostics.contextCharactersUsed)
      .toBeLessThanOrEqual(compactFourApplicationContext ? 22_500 : 24_000);
    expect(JSON.stringify(prompt).includes("Configit")).toBe(expectedApplications.includes("Configit"));
    const participationByApplication = new Map(summary.subjectApplicationParticipation.map((item) => [item.application, item]));
    if (compactFourApplicationContext) {
      expect(participationByApplication.get("Codebeamer")?.representativeEntity?.kind).toMatch(/requirement/);
      expect(participationByApplication.get("Windchill")?.representativeEntity?.displayLabel).toMatch(/Steering part 0000003874/);
      expect(participationByApplication.get("SAP")?.representativeEntity?.displayLabel).toBe("Material MAT7893");
    } else {
      expect(participationByApplication.get("Codebeamer")?.representativeEntityKinds).toContain("requirement");
      expect(participationByApplication.get("Windchill")?.representativeEntityLabels?.join(" "))
        .toMatch(/Steering part 0000003874/);
      expect(participationByApplication.get("SAP")?.representativeEntityLabels).toContain("Material MAT7893");
    }
    expect(participationByApplication.get("Codebeamer")?.contribution).toBe("requirements");
    expect(participationByApplication.get("Windchill")?.contribution).toBe("engineering product records");
    expect(participationByApplication.get("SAP")?.contribution).toBe("operational material and transaction records");
    expect(summary.crossSystemParticipationSummary).toContain("same Steering investigation subject");
    if (compactFourApplicationContext) {
      const connectivityNarrative =
        "Codebeamer, Windchill, SAP, and Configit contribute records to the same Steering investigation subject. " +
        "Shared subject participation does not establish a direct engineering relationship between their records.";
      expect(summary.crossSystemParticipationSummary).toBe(connectivityNarrative);
      expect(JSON.stringify(prompt).split(connectivityNarrative).length - 1).toBe(1);
      expect(summary.subjectApplicationParticipation.map((item) => item.application)).toEqual([
        "Codebeamer",
        "Windchill",
        "SAP",
        "Configit",
      ]);
    }
    for (const participation of summary.subjectApplicationParticipation) {
      if (compactFourApplicationContext) {
        expect(participation.representativeEntity).toBeDefined();
      } else {
        expect(participation.representativeEntityIds?.length).toBeLessThanOrEqual(2);
      }
      expect(participation.participantCount).toBeGreaterThan(0);
    }
  }, 20_000);

  it("includes one named primary entity from every application in the E1 payload", () => {
    const question = "What are the primary entities present in this investigation?";
    const packet = buildInvestigationContext(snapshot, question);
    const prompt = engineeringPromptPayload(question, packet);
    if (!("engineeringBrief" in prompt)) throw new Error("E1 summary prompt projection is unavailable.");

    expect(packet.questionIntent).toBe("summary");
    const participationByApplication = new Map(
      packet.engineeringBrief.subjectApplicationParticipation.map((participation) => [
        participation.application,
        participation,
      ]),
    );
    expect(packet.engineeringBrief.subjectApplicationParticipation.map((participation) => ({
      source: participation.application.toLocaleLowerCase(),
      displayName: participation.representativeEntity?.displayLabel,
    }))).toEqual([
      { source: "codebeamer", displayName: "Steering System Requirements" },
      { source: "windchill", displayName: "Steering part 0000003874" },
      { source: "sap", displayName: "Material MAT7893" },
      { source: "configit", displayName: "Steering, Work-item ID 305" },
    ]);
    expect(participationByApplication.get("Configit")?.representativeEntity).toMatchObject({
      entityId: "configit:subject:305",
      nativeId: "305",
      semanticRole: "product/work-item subject",
      status: "InProgress",
      citationId: expect.stringContaining("configit%3Asubject%3A305"),
    });
    expect(prompt.engineeringBrief.primaryEntities.map(({ source, displayName }) => ({ source, displayName }))).toEqual([
      { source: "codebeamer", displayName: "Steering System Requirements" },
      { source: "windchill", displayName: "Steering part 0000003874" },
      { source: "sap", displayName: "Material MAT7893" },
      { source: "configit", displayName: "Steering, Work-item ID 305" },
    ]);
    const canonicalEntities = (snapshot.canonical?.value as { entities?: Array<{ id: string; kind: string }> } | undefined)
      ?.entities ?? [];
    expect(canonicalEntities.some((entity) =>
      entity.id === "configit:family:mrkt" && entity.kind === "configuration-family",
    )).toBe(true);
    const canonicalRelationships = (
      snapshot.canonical?.value as {
        relationships?: Array<{ kind: string; sourceEntityId: string; targetEntityId: string }>;
      } | undefined
    )?.relationships ?? [];
    expect(canonicalRelationships).toContainEqual(expect.objectContaining({
      kind: "has-product-context",
      sourceEntityId: "configit:subject:305",
      targetEntityId: "configit:detail:work-item-status",
    }));
    expect(canonicalRelationships).toContainEqual(expect.objectContaining({
      kind: "has-configuration-family",
      sourceEntityId: "configit:subject:305",
      targetEntityId: "configit:family:mrkt",
    }));
    expect(JSON.stringify(prompt).length).toBeLessThanOrEqual(24_000);
  }, 20_000);

  it("builds Product 360 from the balanced participation representatives and their citations", () => {
    const question = "Give me a Product 360 overview.";
    const packet = buildInvestigationContext(snapshot, question);
    const prompt = engineeringPromptPayload(question, packet) as {
      product360PreContext?: {
        subject: { id: string; displayName: string };
        applicationPrimer: { application: string; contribution: string }[];
        applicationManifest: {
          application: string;
          representativeEntityId: string;
          representativeDisplayLabel: string;
          nativeId?: string;
          semanticKind: string;
          semanticRole?: string;
          participatingRecordCount: number;
          representativeCitationId: string;
          drillDownCategories: { key: string; label: string; available: true }[];
        }[];
        verifiedRelationships: { category: string; citationId: string; evidenceCitationIds: string[] }[];
        evidenceBoundary: string;
      };
    };
    const product360 = prompt.product360PreContext;
    if (!product360) throw new Error("Product 360 prompt projection is unavailable.");

    expect(packet.questionIntent).toBe("product-360");
    expect(product360.subject).toMatchObject({
      id: packet.engineeringBrief.subjectApplicationParticipation[0].subjectId,
      displayName: "Steering",
    });
    expect(product360.applicationManifest.map((entry) => ({
      application: entry.application.toLocaleLowerCase(),
      representativeEntityId: entry.representativeEntityId,
      representativeDisplayLabel: entry.representativeDisplayLabel,
      nativeId: entry.nativeId,
      semanticKind: entry.semanticKind,
      semanticRole: entry.semanticRole,
    }))).toEqual([
      {
        application: "codebeamer",
        representativeEntityId: "codebeamer:primary-codebeamer:item:1187",
        representativeDisplayLabel: "Steering System Requirements",
        nativeId: "1187",
        semanticKind: "requirement",
        semanticRole: "requirement",
      },
      {
        application: "windchill",
        representativeEntityId: "windchill:0:0000003874/0000003874#0",
        representativeDisplayLabel: "Steering part 0000003874",
        nativeId: "0000003874/0000003874#0",
        semanticKind: "part-occurrence",
        semanticRole: "part-occurrence",
      },
      {
        application: "sap",
        representativeEntityId: "sap:material:mat7893",
        representativeDisplayLabel: "Material MAT7893",
        nativeId: "MAT7893",
        semanticKind: "source-representation",
        semanticRole: "operational material",
      },
      {
        application: "configit",
        representativeEntityId: "configit:subject:305",
        representativeDisplayLabel: "Steering, Work-item ID 305",
        nativeId: "305",
        semanticKind: "source-representation",
        semanticRole: "product/work-item subject",
      },
    ]);
    expect(product360.applicationManifest.map((entry) => [
      entry.application,
      entry.participatingRecordCount,
    ])).toEqual([
      ["Codebeamer", 17],
      ["Windchill", 17],
      ["SAP", 114],
      ["Configit", 41],
    ]);

    const participationByApplication = new Map(
      packet.engineeringBrief.subjectApplicationParticipation.map((entry) => [entry.application, entry]),
    );
    for (const entry of product360.applicationManifest) {
      const participation = participationByApplication.get(entry.application)!;
      expect(entry.representativeCitationId).toBe(participation.representativeEntity?.citationId);
      expect(entry.participatingRecordCount).toBe(participation.participantCount);
      expect(packet.citations.some((citation) =>
        citation.citationId === entry.representativeCitationId,
      )).toBe(true);
    }

    const configit = product360.applicationManifest.find((entry) => entry.application === "Configit")!;
    expect(configit.representativeEntityId).toBe("configit:subject:305");
    expect(configit.drillDownCategories.map(({ key }) => key)).toEqual(expect.arrayContaining([
      "product-work-item-details",
      "product-models-and-contexts",
      "configuration-families",
      "features",
      "rules-and-expressions",
      "metadata",
    ]));
    expect(product360.applicationManifest.some((entry) =>
      entry.representativeEntityId === "configit:family:mrkt",
    )).toBe(false);
    expect(product360.applicationPrimer.map(({ application }) => application)).toEqual([
      "Codebeamer",
      "Windchill",
      "SAP",
      "Configit",
    ]);
    expect(product360.applicationPrimer.every(({ contribution }) => !/Steering|305|MAT7893|0000003874|MRKT/.test(contribution)))
      .toBe(true);
    expect(product360.verifiedRelationships.every((relationship) =>
      relationship.category === "canonical" || relationship.category === "ontology-resolved",
    )).toBe(true);
    expect(packet.relationships.filter((relationship) =>
      relationship.category === "ontology-resolved",
    )).toHaveLength(0);
    expect(packet.relationshipFlow.ontologyGraph.impactPathCount).toBe(0);
    expect(packet.relationshipFlow.ontologyGraph.impactChainCount).toBe(0);
    expect(product360.verifiedRelationships.every((relationship) =>
      relationship.sourceApplication.toLocaleLowerCase() === relationship.targetApplication.toLocaleLowerCase(),
    )).toBe(true);
    expect(product360.verifiedRelationships.every((relationship) =>
      [relationship.citationId, ...relationship.evidenceCitationIds].every((citationId) =>
        packet.citations.some((citation) => citation.citationId === citationId),
      ),
    )).toBe(true);
    expect(product360.evidenceBoundary).toMatch(/shared subject participation does not establish a direct/i);
    expect(JSON.stringify(product360)).not.toContain("subject-traceability");
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(24_000);
    expect(JSON.stringify(prompt).length).toBeLessThanOrEqual(24_000);
  }, 20_000);

  it("fails Product 360 projection when a participating application lacks a selected representative or citation", () => {
    const question = "Give me a Product 360 overview.";
    const packet = buildInvestigationContext(snapshot, question);
    const participation = packet.engineeringBrief.subjectApplicationParticipation;
    const missingRepresentative = {
      ...packet,
      engineeringBrief: {
        ...packet.engineeringBrief,
        subjectApplicationParticipation: participation.map((entry) =>
          entry.application === "Windchill"
            ? { ...entry, representativeEntity: undefined }
            : entry,
        ),
      },
    };
    const missingCitation = {
      ...packet,
      engineeringBrief: {
        ...packet.engineeringBrief,
        subjectApplicationParticipation: participation.map((entry) =>
          entry.application === "Windchill" && entry.representativeEntity
            ? {
                ...entry,
                representativeEntity: {
                  ...entry.representativeEntity,
                  citationId: "cite:entity:not-allowed",
                },
              }
            : entry,
        ),
      },
    };

    expect(() => engineeringPromptPayload(question, missingRepresentative))
      .toThrow(/representative for Windchill/i);
    expect(() => engineeringPromptPayload(question, missingCitation))
      .toThrow(/citation.*Windchill|Windchill.*citation/i);
  }, 20_000);

  it("keeps prompt growth bounded when authoritative subject edges grow", () => {
    const typedSnapshot = snapshot as InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>;
    const expanded = JSON.parse(JSON.stringify(snapshot)) as InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>;
    const canonical = expanded.canonical?.value;
    const graph = canonical?.knowledgeGraph;
    const sourceEdge = graph?.subjectTraceabilityRelationships[0];
    const sourceEntity = sourceEdge
      ? canonical?.entities.find((entity) => entity.id === sourceEdge.sourceEntityId)
      : undefined;
    if (!canonical || !graph || !sourceEdge || !sourceEntity) throw new Error("Saved subject-traceability fixture is incomplete.");

    for (let index = 0; index < 400; index += 1) {
      const entityId = `large-fixture:${index}`;
      const nativeId = `${sourceEntity.provenance.nativeId ?? "record"}-${index}`;
      canonical.entities.push({
        ...sourceEntity,
        id: entityId,
        displayName: `${sourceEntity.displayName} ${index}`,
        provenance: { ...sourceEntity.provenance, nativeId },
      });
      graph.subjectTraceabilityRelationships.push({
        ...sourceEdge,
        id: `large-fixture:subject-edge:${index}`,
        sourceEntityId: entityId,
        sourceNativeId: nativeId,
        citationId: `cite:relationship:large-fixture:${index}`,
        citationIds: [],
        provenance: { ...sourceEdge.provenance, sourceNativeId: nativeId },
      });
    }

    const baseline = engineeringPromptPayload(m1, buildInvestigationContext(snapshot, m1));
    const largePacket = buildInvestigationContext(expanded, m1);
    const largePrompt = engineeringPromptPayload(m1, largePacket);
    expect(graph.subjectTraceabilityRelationships).toHaveLength(
      (typedSnapshot.canonical?.value.knowledgeGraph?.subjectTraceabilityRelationships.length ?? 0) + 400,
    );
    expect(largePacket.subjectTraceabilityDiagnostics.graphSubjectTraceabilityEdgeCount).toBeGreaterThan(400);
    expect(largePacket.subjectTraceabilityDiagnostics.entityLevelSubjectEdgesIncludedInPrompt).toBe(0);
    expect(largePacket.subjectTraceabilityDiagnostics.contextCharactersUsed).toBeLessThanOrEqual(24_000);
    expect(JSON.stringify(largePrompt).length - JSON.stringify(baseline).length).toBeLessThan(3_000);
  }, 20_000);

  it("keeps subject participation separate from M2 impact evidence and blocks unsupported consequences", () => {
    const packet = buildInvestigationContext(snapshot, m2);
    const prompt = engineeringPromptPayload(m2, packet);
    if (!("resolvedRelationships" in prompt)) throw new Error("M2 consequence prompt projection is unavailable.");
    const consequenceState = packet.consequenceEvidenceState;
    if (!consequenceState) throw new Error("M2 consequence evidence state is unavailable.");

    expect(packet.consequenceEvidenceState).toMatchObject({
      intent: "consequence",
      requestedRelationshipType: "operationally-represented-as",
      sourceApplication: "windchill",
      targetApplication: "sap",
      ontologyRelationshipEstablished: false,
      eligibleImpactPathAvailable: false,
      allowedConclusion: "insufficient-evidence",
    });
    expect(packet.reasoningPackage.subjectTraceabilityRelationships).toHaveLength(0);
    expect(packet.reasoningPackage.subjectTraceabilityNarratives).toHaveLength(0);
    expect(packet.impactPaths.every((path) => path.impactEligible)).toBe(true);
    expect(packet.reasoningPackage.impactChains.every((chain) =>
      chain.relationshipIds.every((id) => !id.startsWith("subject-traceability:")),
    )).toBe(true);
    expect(prompt.resolvedRelationships.some((relationship) =>
      relationship.category === "subject-traceability",
    )).toBe(false);
    expect(prompt.requestedEntities.map(({ source, displayName }) => ({ source, displayName }))).toEqual(
      expect.arrayContaining([
        { source: "windchill", displayName: "Windchill part 0000003874" },
        { source: "sap", displayName: "SAP material MAT7893" },
      ]),
    );
    expect(JSON.stringify(prompt)).not.toMatch(/Steering represented as Steering/i);
    expect(JSON.stringify(prompt)).not.toMatch(/Codebeamer|subjectApplicationParticipation|participantCount|accounting.document/i);
    expect(prompt.unresolvedEvaluations).toHaveLength(1);
    expect(prompt.unresolvedEvaluations[0].ruleId).toBe("WC_PART_TO_SAP_MATERIAL");
    expect(prompt).toHaveProperty("citations");
    expect(prompt).not.toHaveProperty("supportingContext");
    expect(prompt.citations.every((citation) =>
      consequenceState.allowedCitationIds.includes(citation.citationId),
    )).toBe(true);
    expect(JSON.stringify(prompt).length).toBeLessThanOrEqual(24_000);
    const providerAnswer = {
      answer: "This could cause inventory issues or production delays.",
      claims: [],
      recommendations: [],
      uncertainties: [],
      followUpQuestions: [],
      snapshotRevision: packet.snapshotRevision,
    };
    const guarded = ensureEngineeringAnswerCoverage(
      providerAnswer,
      packet.engineeringBrief,
      packet.citations,
      false,
      "impact",
      packet,
    ) as { answer: string };
    expect(guarded).toEqual(providerAnswer);
  });
});
