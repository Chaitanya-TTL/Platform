import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { InvestigationSnapshot } from "../../kernel/contracts/investigation-snapshot";
import type { EngineeringIntelligenceInvestigationV1, IntelligenceEntity, IntelligenceRelationship } from "../../contracts/intelligence-v1";
import {
  buildInvestigationContext,
  engineeringPromptPayload,
  ensureEngineeringAnswerCoverage,
  stableCitationId,
} from "../context-builder";

const temporal = { capturedAt: "2026-10-22T08:00:00.000Z", assembledAt: "2026-10-22T08:01:00.000Z", freshness: "current" as const };
const relationshipDocument = readFileSync(resolve(process.cwd(), "..", "docs", "relationships.md"), "utf8");

function entity(id: string, source: "windchill" | "sap" | "teamcenter" | "codebeamer" | "configit", nativeId: string, displayName: string, partNumber: string): IntelligenceEntity {
  return {
    id,
    kind: "part",
    displayName,
    identityQuality: "native",
    assertion: "fact",
    properties: { partNumber: { type: "text", text: partNumber } },
    provenance: { source, provider: `${source}-fixture`, nativeId, observedAt: temporal.capturedAt, authority: "source-authoritative" },
    temporal,
  };
}

function link(id: string, sourceEntityId: string, targetEntityId: string): IntelligenceRelationship {
  return { ...relation, id, sourceEntityId, targetEntityId };
}

const windchillPart = entity("entity:wc-1", "windchill", "OR:wt.part.WTPart:1001", "Steering Housing", "WC-1001");
const sapMaterial = entity("entity:sap-1", "sap", "000000000000004200", "Steering Housing Material", "MAT-4200");
const relation: IntelligenceRelationship = {
  id: "relationship:allocation-1",
  kind: "allocated-to",
  family: "part-material",
  sourceEntityId: windchillPart.id,
  targetEntityId: sapMaterial.id,
  assertion: "fact",
  confidence: "verified",
  evidenceIds: ["evidence:link-1"],
  properties: {},
  provenance: { source: "windchill", provider: "fixture", observedAt: temporal.capturedAt, authority: "source-authoritative" },
  temporal,
};

function canonical(entities: IntelligenceEntity[] = [], relationships: IntelligenceRelationship[] = []): EngineeringIntelligenceInvestigationV1 {
  return {
    contractVersion: "1.0",
    investigationId: "investigation-context-test",
    subject: {
      id: "subject:steering",
      displayName: "Steering Assembly",
      candidateIds: entities.map((item) => item.id),
      confidence: "verified",
      reasons: [],
      provenance: { provider: "fixture", observedAt: temporal.capturedAt, authority: "backend-derived" },
      temporal,
    },
    entities,
    relationships,
    evidence: entities.length ? [{ id: "evidence:link-1", kind: "source-record", summary: "Source confirms the link", source: "windchill", provenance: relation.provenance, temporal }] : [],
    findings: [],
    sources: entities.map((item) => ({ entityId: item.id, source: item.provenance.source!, status: "available", provenance: item.provenance })),
    identityClusters: [],
    temporal,
    summary: { entityCount: entities.length, relationshipCount: relationships.length, evidenceCount: entities.length ? 1 : 0, findingCount: 0, availableSourceCount: entities.length, partialSourceCount: 0, status: "success" },
  };
}

function snapshot(value?: EngineeringIntelligenceInvestigationV1, overrides: Partial<InvestigationSnapshot<EngineeringIntelligenceInvestigationV1>> = {}): InvestigationSnapshot<EngineeringIntelligenceInvestigationV1> {
  return {
    identity: { investigationId: "investigation-context-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 7, executionEpoch: 2 },
    lifecycle: "ready",
    subjectLabel: "Steering Assembly",
    query: "Steering Assembly",
    selections: [
      { source: "windchill", nativeId: "OR:wt.part.WTPart:1001", displayName: "Steering Housing" },
      { source: "sap", nativeId: "000000000000004200", displayName: "Steering Housing Material" },
    ],
    executions: {},
    acceptedEvidenceIds: [],
    completeness: { overall: "complete", requestedSources: ["windchill", "sap"], successfulSources: ["windchill", "sap"], partialSources: [], failedSources: [], pendingSources: [], limitations: [] },
    canonical: value ? { revision: 7, publishedAt: temporal.assembledAt, value } : undefined,
    warnings: [],
    createdAt: temporal.capturedAt,
    updatedAt: temporal.assembledAt,
    ...overrides,
  };
}

describe("investigation copilot context", () => {
  it.skipIf(!existsSync(resolve(
    process.cwd(),
    ".lattice-data",
    "investigations",
    "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
    "snapshot.json",
  )))("adds a compact Product 360 projection without changing E1 representatives", () => {
    const savedSnapshotPath = resolve(
      process.cwd(),
      ".lattice-data",
      "investigations",
      "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
      "snapshot.json",
    );
    const savedSnapshot = JSON.parse(readFileSync(savedSnapshotPath, "utf8")) as InvestigationSnapshot;
    const broadQuestion = "Give me a Product 360 overview.";
    const productPacket = buildInvestigationContext(savedSnapshot, broadQuestion);
    const productPrompt = engineeringPromptPayload(broadQuestion, productPacket) as {
      product360PreContext?: {
        applicationManifest: {
          application: string;
          representativeEntityId: string;
          representativeCitationId: string;
          drillDownCategories: { key: string }[];
        }[];
        verifiedRelationships: { category: string }[];
        applicationDigests: {
          application: string;
          verifiedRelationships: unknown[];
          facts: { summary: string }[];
        }[];
        evidenceBoundary: string;
      };
    };
    const product360 = productPrompt.product360PreContext;
    if (!product360) throw new Error("Product 360 projection is unavailable.");
    expect(productPacket.questionIntent).toBe("product-360");
    expect(productPacket.ambiguity.clarificationRequired).toBe(false);
    expect(productPacket.entityCandidates).toEqual([]);
    expect(product360.applicationManifest.map((entry) => entry.application)).toEqual([
      "Codebeamer",
      "Windchill",
      "SAP",
      "Configit",
    ]);
    expect(product360.applicationManifest.find((entry) => entry.application === "Configit"))
      .toMatchObject({ representativeEntityId: "configit:subject:305" });
    expect(product360.applicationManifest.find((entry) => entry.application === "Configit")?.drillDownCategories)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ key: "configuration-families" }),
        expect.objectContaining({ key: "features" }),
        expect.objectContaining({ key: "rules-and-expressions" }),
      ]));
    expect(product360.applicationManifest.some((entry) =>
      entry.representativeEntityId === "configit:family:mrkt",
    )).toBe(false);
    expect(product360.verifiedRelationships.every((relationship) =>
      relationship.category === "canonical" || relationship.category === "ontology-resolved",
    )).toBe(true);
    expect(product360.applicationDigests.every((digest) => digest.verifiedRelationships.length === 0)).toBe(true);
    expect(product360.applicationDigests.find((digest) => digest.application === "Configit")?.facts
      .find((fact) => fact.summary.startsWith("Configuration families:"))?.summary)
      .toContain("Drive Orientation");
    expect(product360.evidenceBoundary).toContain("Shared subject participation does not establish a direct");
    for (const source of productPacket.grounding.partialSources) {
      expect(product360.evidenceBoundary).toContain(source);
    }

    const e1Packet = buildInvestigationContext(
      savedSnapshot,
      "What are the primary entities present in this investigation?",
    );
    expect(e1Packet.engineeringBrief.subjectApplicationParticipation.every((entry) =>
      entry.drillDownCategories === undefined,
    )).toBe(true);
    expect(JSON.stringify(productPacket).length).toBeLessThanOrEqual(22_500);
    expect(JSON.stringify(productPrompt).length).toBeLessThanOrEqual(22_500);

    const compactPacket = buildInvestigationContext(savedSnapshot, broadQuestion, {
      maxContextChars: 20_000,
    });
    const compactPrompt = engineeringPromptPayload(broadQuestion, compactPacket) as typeof productPrompt;
    const compactProduct360 = compactPrompt.product360PreContext;
    if (!compactProduct360) throw new Error("Budgeted Product 360 projection is unavailable.");
    expect(JSON.stringify(compactPacket).length).toBeLessThanOrEqual(20_000);
    expect(JSON.stringify(compactPrompt).length).toBeLessThanOrEqual(20_000);
    expect(compactProduct360.applicationManifest.map((entry) => [
      entry.application,
      entry.representativeEntityId,
      entry.representativeCitationId,
    ])).toEqual(product360.applicationManifest.map((entry) => [
      entry.application,
      entry.representativeEntityId,
      entry.representativeCitationId,
    ]));
    const drillDownCategoriesOmitted = compactPacket.omissions.categories.includes("product360DrillDownCategories");
    if (drillDownCategoriesOmitted) {
      expect(compactProduct360.applicationManifest.every((entry) =>
        entry.drillDownCategories.length === 0 &&
        compactPacket.citations.some((citation) => citation.citationId === entry.representativeCitationId),
      )).toBe(true);
      expect(compactProduct360.evidenceBoundary).toContain("Drill-down availability metadata was omitted");
    } else {
      expect(compactProduct360.applicationManifest.map((entry) => entry.drillDownCategories))
        .toEqual(product360.applicationManifest.map((entry) => entry.drillDownCategories));
    }
  }, 20_000);

  it.skipIf(!existsSync(resolve(
    process.cwd(),
    ".lattice-data",
    "investigations",
    "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
    "snapshot.json",
  )))("builds bounded, cited application digests from saved Steering evidence", () => {
    const savedSnapshotPath = resolve(
      process.cwd(),
      ".lattice-data",
      "investigations",
      "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
      "snapshot.json",
    );
    const savedSnapshot = JSON.parse(readFileSync(savedSnapshotPath, "utf8")) as InvestigationSnapshot;
    const packet = buildInvestigationContext(
      savedSnapshot,
      "Tell me everything known about this product across all participating applications.",
    );
    const digests = packet.applicationDigests ?? [];
    const citationIds = new Set(packet.citations.map((citation) => citation.citationId));
    const digestByApplication = new Map(digests.map((digest) => [digest.application.toLowerCase(), digest]));
    const summaries = (application: string) =>
      (digestByApplication.get(application.toLowerCase())?.facts ?? []).map((fact) => fact.summary).join(" ");

    expect(digests.map((digest) => digest.application)).toEqual([
      "Codebeamer",
      "Windchill",
      "SAP",
      "Configit",
    ]);
    const factLimits: Record<string, number> = {
      Codebeamer: 3,
      Windchill: 5,
      SAP: 5,
      Configit: 5,
    };
    expect(digests.every((digest) => digest.facts.length <= factLimits[digest.application])).toBe(true);
    expect(digests.every((digest) =>
      digest.facts.every((fact) => fact.citationIds.length > 0 &&
        fact.citationIds.every((citationId) => citationIds.has(citationId))),
    )).toBe(true);
    expect(digests.every((digest) =>
      digest.secondaryEntities.every((entity) =>
        entity.citationId && citationIds.has(entity.citationId) &&
        !("properties" in entity),
      ),
    )).toBe(true);
    expect(summaries("Codebeamer")).toMatch(/Steering product|status New|requirements/i);
    expect(packet.relationships)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "manages", category: "canonical" }),
      ]));
    expect(summaries("Windchill")).toMatch(/2\.50 KG|20 x 30 x 40|A\.2|In Work/i);
    expect(digestByApplication.get("windchill")?.secondaryEntities.map((entity) => entity.kind))
      .toEqual(expect.arrayContaining(["requirement", "change-task"]));
    expect(summaries("Windchill")).toContain("Engineering Change Notice");
    expect(packet.grounding.partialSources.map((source) => source.toLowerCase()))
      .toContain("sap");
    expect(packet.grounding.staleSources.map((source) => source.toLowerCase()))
      .toContain("sap");
    expect(summaries("SAP")).toMatch(/Blocked stock: \d+ EA/i);
    expect(summaries("SAP")).toMatch(/Movement type: \d+/i);
    expect(summaries("SAP")).toMatch(/Accounting document records:/i);
    expect(summaries("SAP")).not.toMatch(/causes?|leads to|operational consequence|procurement|production/i);

    const configit = digestByApplication.get("configit");
    const configitSummary = summaries("Configit");
    expect(configitSummary).toContain("InProgress");
    expect(configitSummary).toMatch(/Market \(MRKT\).*Drive Orientation.*Steering Type/);
    expect(configit?.secondaryEntities.map((entity) => entity.label).join(" "))
      .toMatch(/DEN|IND|USA/);
    expect(configitSummary).toMatch(/if MRKT\.(?:IND|DEN|USA)/i);
    expect(configit?.verifiedRelationships.every((relationship) =>
      relationship.category === "canonical" || relationship.category === "ontology-resolved",
    )).toBe(true);
    expect(JSON.stringify(digests)).not.toContain('"properties"');
  }, 20_000);

  it.skipIf(!existsSync(resolve(
    process.cwd(),
    ".lattice-data",
    "investigations",
    "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
    "snapshot.json",
  )))("keeps focused Configit answers and claims isolated from global application coverage", () => {
    const savedSnapshotPath = resolve(
      process.cwd(),
      ".lattice-data",
      "investigations",
      "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
      "snapshot.json",
    );
    const savedSnapshot = JSON.parse(readFileSync(savedSnapshotPath, "utf8")) as InvestigationSnapshot;
    const question = "Tell me everything coming from Configit for this product.";
    const packet = buildInvestigationContext(savedSnapshot, question);
    const prompt = engineeringPromptPayload(question, packet) as {
      applicationOverview?: { application: string; digest?: { facts: { summary: string; citationIds: string[] }[] } };
      questionSpecificEvidence: { entities: unknown[]; citations: { citationId: string }[] };
      engineeringBrief?: unknown;
    };
    const configitParticipation = packet.engineeringBrief.subjectApplicationParticipation.find(
      (entry) => entry.application.toLowerCase() === "configit",
    );
    const otherApplicationCitation = packet.engineeringBrief.subjectApplicationParticipation.find(
      (entry) => entry.application.toLowerCase() === "codebeamer",
    )?.representativeEntity?.citationId;
    if (!configitParticipation?.representativeEntity || !otherApplicationCitation) {
      throw new Error("Saved Steering fixture is missing application representatives.");
    }

    expect(packet.questionIntent).toBe("application-overview");
    expect(packet.applicationOverviewApplication).toBe("configit");
    expect(prompt.applicationOverview?.application).toBe("configit");
    expect(prompt).not.toHaveProperty("engineeringBrief");
    expect(prompt.questionSpecificEvidence.entities).toEqual([]);
    expect(prompt.questionSpecificEvidence.citations.some((citation) =>
      citation.citationId === otherApplicationCitation,
    )).toBe(false);
    expect(JSON.stringify(prompt.applicationOverview)).not.toMatch(/Codebeamer|Windchill|SAP/);

    const answer = ensureEngineeringAnswerCoverage(
      {
        answer: "Applications Present: Codebeamer, Windchill, SAP, and Configit. Primary entities: unrelated Codebeamer relationship.",
        claims: [{ text: "Codebeamer manages a requirement.", kind: "fact", citationIds: [otherApplicationCitation] }],
      },
      packet.engineeringBrief,
      packet.citations,
      true,
      packet.questionIntent,
      packet,
    ) as { answer: string; claims: { citationIds: string[] }[] };

    expect(answer.answer).toContain("## Investigation subject and Configit scope");
    expect(answer.answer).toContain("## Configit representative");
    expect(answer.answer).toContain("## Configuration families");
    expect(answer.answer.match(/## Configuration families/g)).toHaveLength(1);
    expect(answer.answer).toMatch(/Market \(MRKT\).*Drive Orientation.*Steering Type/s);
    expect(answer.answer).toMatch(/DEN.*IND.*USA/s);
    expect(answer.answer).toContain("## Configuration features");
    expect(answer.answer.match(/## Configuration features/g)).toHaveLength(1);
    expect(answer.answer).toContain("## Rules and expressions");
    expect(answer.answer).toContain("## Verified Configit relationships");
    expect(answer.answer).toContain("## Configit source state and evidence boundaries");
    expect(answer.answer).toContain("## Configit drill-down options");
    expect(answer.answer).toContain("Steering is the investigation subject.");
    expect(answer.answer).not.toMatch(/Applications Present|Primary entities|Codebeamer|Windchill|SAP/);
    const allowedCitationIds = new Set([
      configitParticipation.representativeEntity.citationId,
      ...(packet.applicationDigests ?? [])
        .filter((digest) => digest.application.toLowerCase() === "configit")
        .flatMap((digest) => [
          ...digest.facts.flatMap((fact) => fact.citationIds),
          ...digest.secondaryEntities.map((entity) => entity.citationId),
          ...digest.verifiedRelationships.flatMap((relationship) => [
            relationship.citationId,
            ...relationship.evidenceCitationIds,
          ]),
        ]),
    ]);
    expect(answer.claims.length).toBeGreaterThan(0);
    expect(answer.claims.every((claim) =>
      claim.citationIds.length > 0 && claim.citationIds.every((citationId) => allowedCitationIds.has(citationId)),
    )).toBe(true);
  }, 20_000);

  it.skipIf(!existsSync(resolve(
    process.cwd(),
    ".lattice-data",
    "investigations",
    "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
    "snapshot.json",
  )))("preserves complete application-overview answers and fills only missing sections", () => {
    const savedSnapshotPath = resolve(
      process.cwd(),
      ".lattice-data",
      "investigations",
      "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
      "snapshot.json",
    );
    const savedSnapshot = JSON.parse(readFileSync(savedSnapshotPath, "utf8")) as InvestigationSnapshot;
    const cases = [
      {
        application: "Configit",
        question: "Tell me everything coming from Configit for this product.",
        details: "Status: InProgress. Market (MRKT) is a secondary family; Drive Orientation and Steering Type are also available. DEN, IND, and USA are Market features. Localization: Danish (DN).",
        relationship: "Steering has the Market configuration family.",
        generatedEvidence: ["Work-item ID", "Status: InProgress", "Market feature: DEN", "Localization: Danish (DN)"],
        generatedRelationship: "Steering has the Market configuration family.",
        invalidLabels: /preferred Product Id|work-item status|Backing feature for|Danish \(DN\): code|source-representation/i,
      },
      {
        application: "SAP",
        question: "Tell me everything coming from SAP for this product.",
        details: "Material ID: MAT7893. Base unit: EA. Blocked stock: 0 EA. Movement type: 261. Document type: WA.",
        relationship: "Material MAT7893 uses EA as its base unit.",
        generatedEvidence: ["Material ID", "Base unit: EA", "Blocked stock: 0 EA", "Movement type: 261", "Document type: WA"],
        generatedRelationship: "Material MAT7893 uses EA as its base unit.",
        invalidLabels: /preferred Product Id|Base unit of measure: value|document Type\s+WA|source-representation/i,
      },
      {
        application: "Windchill",
        question: "Tell me everything coming from Windchill for this product.",
        details: "Child structure available: No. Dimensions: 20 × 30 × 40. Weight: 2.50 kg.",
        relationship: "Steering is linked to its recorded Windchill product context.",
        generatedEvidence: ["Child structure available: No", "Dimensions: 20 × 30 × 40", "Weight: 2.50 kg"],
        generatedRelationship: "Steering is linked to its recorded Windchill product context.",
        invalidLabels: /Has Children: false|Dimension: value|Weight: value|part-occurrence/i,
      },
      {
        application: "Codebeamer",
        question: "Tell me everything coming from Codebeamer for this product.",
        details: "Project/tracker role: project. Lifecycle group: Key lifecycle. Description: Steering System Requirements.",
        relationship: "The Lifecycle group contains the Priority detail.",
        generatedEvidence: ["Project/tracker role: project", "Lifecycle group:"],
        generatedRelationship: "The Lifecycle group contains the Priority detail.",
        invalidLabels: /presentation Role project|group Key lifecycle|description\s+[A-Z]/i,
      },
    ] as const;
    const expectedRepresentatives: Record<string, string> = {
      Configit: "Steering, Work-item ID 305",
      SAP: "Material MAT7893",
      Windchill: "Steering part 0000003874",
      Codebeamer: "Steering System Requirements",
    };

    for (const testCase of cases) {
      const packet = buildInvestigationContext(savedSnapshot, testCase.question);
      const participation = packet.engineeringBrief.subjectApplicationParticipation.find(
        (entry) => entry.application === testCase.application,
      );
      const representative = participation?.representativeEntity;
      const digest = packet.applicationDigests?.find(
        (entry) => entry.application === testCase.application,
      );
      if (!participation || !representative || !digest) {
        throw new Error(`Saved Steering fixture is missing ${testCase.application} overview evidence.`);
      }
      expect(representative.displayLabel).toBe(expectedRepresentatives[testCase.application]);
      const additionalRelationshipSentences = digest.verifiedRelationships.flatMap((relationship) => {
        const target = relationship.targetLabel.toLocaleLowerCase();
        if (testCase.relationship.toLocaleLowerCase().includes(target) ||
            (testCase.application === "SAP" && /base unit/i.test(target) &&
              /base unit/i.test(testCase.relationship)) ||
            (testCase.application === "Windchill" && /product context/i.test(target) &&
              /product context/i.test(testCase.relationship))) return [];
        if (relationship.kind === "has-configuration-family") {
          return [`${relationship.sourceLabel} has the ${relationship.targetLabel} configuration family.`];
        }
        if (relationship.kind === "contains" && /lifecycle/i.test(relationship.sourceLabel)) {
          return [`The ${relationship.sourceLabel} group contains the ${relationship.targetLabel} detail.`];
        }
        return [`${relationship.sourceLabel} ${relationship.kind.replace(/[-_]/g, " ")} ${relationship.targetLabel}.`];
      });

      const completeAnswer = {
        answer: [
          `${savedSnapshot.subjectLabel} is the investigation subject.`,
          `## ${testCase.application} overview`,
          `${representative.displayLabel} (${representative.nativeId ?? ""}; ${representative.citationId}) is the selected representative.`,
          testCase.details,
          testCase.relationship,
          ...additionalRelationshipSentences,
          `${testCase.application} source status is partial where recorded; source freshness is bounded. Participation establishes investigation scope only, not a cross-application relationship or consequence.`,
          `Available for drill-down: ${participation.drillDownCategories?.map((category) => category.label).join(", ")}.`,
        ].join("\n"),
        claims: [{
          text: `${representative.displayLabel} and selected ${testCase.application} evidence.`,
          kind: "fact",
          citationIds: [
            representative.citationId,
            ...digest.facts.flatMap((fact) => fact.citationIds),
            ...digest.secondaryEntities.map((entity) => entity.citationId),
            ...digest.verifiedRelationships.flatMap((relationship) => [
              relationship.citationId,
              ...relationship.evidenceCitationIds,
            ]),
          ],
        }],
      };
      const applyCoverage = (candidate: typeof completeAnswer) =>
        ensureEngineeringAnswerCoverage(
          candidate,
          packet.engineeringBrief,
          packet.citations,
          false,
          packet.questionIntent,
          packet,
        ) as typeof completeAnswer;

      const completeResult = applyCoverage(completeAnswer);
      expect(completeResult).toBe(completeAnswer);
      expect(completeResult.answer.match(/## [^\n]+ overview/gi)).toHaveLength(1);
      expect(completeResult.answer.match(/is the selected representative/g)).toHaveLength(1);
      expect(completeResult.answer).not.toMatch(/^\s*is the investigation subject\.\s*$/im);
      expect(completeResult.answer).not.toMatch(testCase.invalidLabels);
      expect(completeResult.answer).not.toMatch(/\b(?:Steer|Lifec|Engin)…/);
      expect(completeResult.claims[0].citationIds.every((citationId) =>
        packet.citations.some((citation) => citation.citationId === citationId),
      )).toBe(true);
      expect(applyCoverage(completeResult)).toBe(completeResult);

      const sparseResult = applyCoverage({
        answer: packet.subject ? `${packet.subject} is the investigation subject.` : "",
        claims: [],
      });
      for (const expected of testCase.generatedEvidence) {
        expect(sparseResult.answer).toContain(expected);
      }
      expect(sparseResult.answer).toContain(testCase.generatedRelationship);
      expect(sparseResult.answer).not.toMatch(testCase.invalidLabels);
      expect(sparseResult.answer).not.toMatch(/^\s*is the investigation subject\.\s*$/im);
      expect(sparseResult.claims.length).toBeGreaterThan(0);
      expect(sparseResult.claims.every((claim) =>
        claim.citationIds.length > 0 && claim.citationIds.every((citationId) =>
          packet.citations.some((citation) => citation.citationId === citationId),
        ),
      )).toBe(true);
      expect(applyCoverage(sparseResult)).toBe(sparseResult);
      const malformedSubject = applyCoverage({
        ...completeAnswer,
        answer: `Overview\nis the investigation subject.\n${completeAnswer.answer}`,
      });
      expect(malformedSubject.answer).not.toMatch(/^\s*is the investigation subject\.\s*$/im);

      const sourceStateLine = `${testCase.application} source status is partial where recorded; source freshness is bounded. Participation establishes investigation scope only, not a cross-application relationship or consequence.`;
      const partialCases = [
        {
          answer: completeAnswer.answer.replace(sourceStateLine, ""),
          missing: /source state|source status|source freshness/i,
        },
        {
          answer: completeAnswer.answer.replace(testCase.relationship, ""),
          missing: /relationship|recorded.*relationship/i,
        },
        {
          answer: completeAnswer.answer.replace(/Available for drill-down:[^\n]*/, ""),
          missing: /drill.down|available for/i,
        },
        {
          answer: completeAnswer.answer.replace(
            `${representative.displayLabel} (${representative.nativeId ?? ""}; ${representative.citationId}) is the selected representative.`,
            "",
          ),
          missing: new RegExp(representative.displayLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        },
      ];
      for (const partialCase of partialCases) {
        const partial = { ...completeAnswer, answer: partialCase.answer };
        const augmented = applyCoverage(partial);
        expect(augmented.answer).toContain(partial.answer.trim());
        expect(augmented.answer).toMatch(partialCase.missing);
        expect(augmented.answer.match(/## [^\n]+ overview/gi)).toHaveLength(1);
        expect(applyCoverage(augmented)).toBe(augmented);
        expect(augmented.claims.flatMap((claim) => claim.citationIds).every((citationId) =>
          packet.citations.some((citation) => citation.citationId === citationId),
        )).toBe(true);
      }
    }
  }, 30_000);

  it("resolves a direct native identifier to its entity and stable citation", () => {
    const packet = buildInvestigationContext(snapshot(canonical([windchillPart, sapMaterial])), "What is OR:wt.part.WTPart:1001?");
    const selected = packet.entities.find((item) => item.entityId === windchillPart.id);
    expect(selected).toMatchObject({ nativeId: "OR:wt.part.WTPart:1001", citationId: stableCitationId("entity", windchillPart.id) });
    expect(packet.grounding.unsupportedIdentifiers).toEqual([]);
  });

  it("includes relation endpoints and preserves their distinct source-native IDs", () => {
    const packet = buildInvestigationContext(snapshot(canonical([windchillPart, sapMaterial], [relation])), "Trace the allocation from Windchill to SAP");
    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: relation.id,
      sourceCitationId: stableCitationId("entity", windchillPart.id),
      targetCitationId: stableCitationId("entity", sapMaterial.id),
      sourceNativeId: "OR:wt.part.WTPart:1001",
      targetNativeId: "000000000000004200",
    }));
    expect(packet.citations.map((citation) => citation.nativeId)).toEqual(expect.arrayContaining([
      "OR:wt.part.WTPart:1001",
      "000000000000004200",
    ]));
  });

  it("includes relationship guidance for the selected path", () => {
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], [relation])),
      "Trace the allocation from Windchill to SAP",
      { relationshipDocument },
    );

    expect(packet.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Windchill",
      targetApplication: "SAP",
    }));
    const guidance = packet.relationshipGuidance.find((section) => section.sourceApplication === "Windchill" && section.targetApplication === "SAP")!;
    expect(guidance.content).toContain("MAY_IMPACT");
    expect(guidance.content).toMatch(/must never be claimed to have caused/i);
    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: relation.id,
      semanticGuidanceAvailable: true,
    }));
  });

  it("includes incoming relationships when the focal entity is the target", () => {
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], [relation])),
      "Trace SAP material 000000000000004200",
      { relationshipDocument },
    );

    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: relation.id,
      sourceEntityId: windchillPart.id,
      targetEntityId: sapMaterial.id,
    }));
  });

  it("preserves path endpoints and evidence when context is trimmed", () => {
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], [relation])),
      "Trace the allocation from Windchill to SAP",
      { relationshipDocument, maxContextChars: 4_000, maxItemsPerCategory: 2 },
    );

    const retained = packet.relationships.find((item) => item.relationshipId === relation.id);
    if (retained) {
      expect(retained.evidenceCitationIds).toContain(stableCitationId("evidence", "evidence:link-1"));
      for (const selectedRelationship of packet.relationships) {
        expect(packet.entities.some((item) => item.entityId === selectedRelationship.sourceEntityId)).toBe(true);
        expect(packet.entities.some((item) => item.entityId === selectedRelationship.targetEntityId)).toBe(true);
        for (const citationId of selectedRelationship.evidenceCitationIds) {
          expect(packet.evidence.some((item) => item.citationId === citationId)).toBe(true);
        }
      }
    } else {
      expect(packet.omissions.omittedCounts.relationships).toBeGreaterThan(0);
      expect(packet.uncertainties.join(" ")).toMatch(/omitted \d+ relationship path/i);
    }
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(4_000);
  });

  it("does not create a relationship from a name-only match", () => {
    const similarlyNamed = entity("entity:wc-2", "windchill", "OR:wt.part.WTPart:1002", "Steering Housing", "WC-1002");
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, similarlyNamed])),
      "Are these Steering Housing records connected?",
      { relationshipDocument },
    );

    expect(packet.relationships).toEqual([]);
  });

  it("does not assert impact for provisional identity candidates", () => {
    const provisionalPart = { ...windchillPart, identityQuality: "provisional" as const };
    const packet = buildInvestigationContext(
      snapshot(canonical([provisionalPart, sapMaterial], [link("provisional:impact", provisionalPart.id, sapMaterial.id)])),
      "Trace OR:wt.part.WTPart:1001 into SAP",
      { relationshipDocument },
    );
    const provisionalPath = packet.relationships.find((item) => item.relationshipId === "provisional:impact");

    expect(provisionalPath).toMatchObject({ identitySupported: false });
    expect(packet.uncertainties.join(" ")).toMatch(/provisional identity/i);
  });

  it("flags an observed Teamcenter pair without documented semantics", () => {
    const teamcenterPart = entity("entity:tc-1", "teamcenter", "TC-1001", "Steering Housing", "TC-1001");
    const packet = buildInvestigationContext(
      snapshot(canonical([teamcenterPart, sapMaterial], [link("runtime:teamcenter-link", teamcenterPart.id, sapMaterial.id)])),
      "Trace Teamcenter record TC-1001 to SAP",
      { relationshipDocument },
    );

    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: "runtime:teamcenter-link",
      semanticGuidanceAvailable: false,
    }));
    expect(packet.relationshipGuidance.some((section) => section.sourceApplication === "Teamcenter")).toBe(false);
    expect(packet.uncertainties.join(" ")).toMatch(/cannot be interpreted.*authoritative/i);
  });

  it("marks the Codebeamer-to-Configit runtime rule as documented", () => {
    const requirementSet = entity("entity:cb-1", "codebeamer", "CB-1190", "Requirement Set", "CB-1190");
    const configitModel = entity("entity:configit-1", "configit", "CFG-305", "Configuration Model", "CFG-305");
    const packet = buildInvestigationContext(
      snapshot(canonical([requirementSet, configitModel], [link("runtime:cb-configit", requirementSet.id, configitModel.id)])),
      "Trace Codebeamer requirement CB-1190 to Configit",
      { relationshipDocument },
    );

    expect(packet.relationships).toContainEqual(expect.objectContaining({
      relationshipId: "runtime:cb-configit",
      semanticGuidanceAvailable: true,
    }));
    expect(packet.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Codebeamer",
      targetApplication: "Configit",
    }));
  });

  it("preserves partial and stale source uncertainty with relationship guidance", () => {
    const value = canonical([windchillPart, sapMaterial], [relation]);
    const staleSnapshot = snapshot(value, {
      completeness: { overall: "partial", requestedSources: ["windchill", "sap"], successfulSources: ["windchill"], partialSources: [], failedSources: ["sap"], pendingSources: [], limitations: ["sap evidence unavailable"] },
      executions: {
        sap: {
          identity: { investigationId: "investigation-context-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 7, executionEpoch: 2, executionId: "exec" as never, correlationId: "corr" as never, source: "sap", operation: "gather-intelligence", attempt: 1 },
          status: "failed",
          capturedAt: "2026-10-20T08:00:00.000Z",
          freshness: "stale",
          warnings: [],
        },
      },
    });
    const packet = buildInvestigationContext(staleSnapshot, "Trace OR:wt.part.WTPart:1001 to SAP", { relationshipDocument });

    expect(packet.relationshipGuidance).toContainEqual(expect.objectContaining({
      sourceApplication: "Windchill",
      targetApplication: "SAP",
    }));
    expect(packet.uncertainties.join(" ")).toMatch(/partial|stale/i);
  });

  it("surfaces no-evidence and unsupported-identifier uncertainty instead of inventing entities", () => {
    const packet = buildInvestigationContext(snapshot(canonical()), "Find item MAT-DOES-NOT-EXIST");
    expect(packet.grounding.hasCanonicalEvidence).toBe(false);
    expect(packet.grounding.unsupportedIdentifiers).toContain("MAT-DOES-NOT-EXIST");
    expect(packet.uncertainties).toEqual(expect.arrayContaining([expect.stringMatching(/no canonical evidence/i), expect.stringMatching(/not found/i)]));
  });

  it("marks partial and stale source states and reports conflicting values", () => {
    const conflictingSap = { ...sapMaterial, properties: { partNumber: { type: "text", text: "SAP-4200" } } };
    const value = canonical([windchillPart, conflictingSap]);
    const staleSnapshot = snapshot(value, {
      completeness: { overall: "partial", requestedSources: ["windchill", "sap"], successfulSources: ["windchill"], partialSources: [], failedSources: ["sap"], pendingSources: [], limitations: ["sap evidence unavailable"] },
      executions: {
        sap: {
          identity: { investigationId: "investigation-context-test" as InvestigationSnapshot["identity"]["investigationId"], revision: 7, executionEpoch: 2, executionId: "exec" as never, correlationId: "corr" as never, source: "sap", operation: "gather-intelligence", attempt: 1 },
          status: "failed",
          capturedAt: "2026-10-20T08:00:00.000Z",
          freshness: "stale",
          warnings: [],
        },
      },
    });
    const packet = buildInvestigationContext(staleSnapshot, "Compare the part numbers");
    expect(packet.grounding.partialSources).toContain("sap");
    expect(packet.grounding.staleSources).toContain("sap");
    const sapSelection = packet.sourceSelections.find((selection) => selection.source === "sap");
    expect(sapSelection).toMatchObject({ citationId: stableCitationId("source", "sap"), status: "failed", freshness: "stale" });
    expect(packet.citations).toContainEqual(expect.objectContaining({
      citationId: stableCitationId("source", "sap"),
      kind: "source",
      summary: expect.stringContaining("does not establish why this status occurred"),
    }));
    expect(packet.conflicts.length).toBeGreaterThan(0);
    expect(packet.uncertainties.join(" ")).toMatch(/partial|stale|conflict/i);
  });

  it("makes unresolved relationship evaluations citeable with their recorded evidence gap", () => {
    const evaluation = {
      ruleId: "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL" as const,
      relationshipType: "requirement-set-model-link",
      status: "unresolved" as const,
      sourceApplication: "codebeamer",
      sourceKinds: ["requirement-set"],
      targetApplication: "configit",
      targetKinds: ["model"],
      sourceCandidates: [],
      targetCandidates: [],
      compatibleSourceCandidates: [],
      compatibleTargetCandidates: [],
      sourceCandidateCount: 0,
      targetCandidateCount: 0,
      sourceCandidatesTruncated: false,
      targetCandidatesTruncated: false,
      observedSourceKinds: [],
      observedTargetKinds: [],
      evidenceIds: [],
      reasonCode: "linkage-evidence-not-found" as const,
      reason: "No approved linkage evidence was found.",
      technicalContext: {
        integrationName: "fixture",
        protocol: "fixture",
        direction: "codebeamer to configit",
        sourceObjectType: "requirement-set",
        targetObjectType: "model",
        documentation: [],
      },
      evaluatedAt: temporal.assembledAt,
    };
    const packet = buildInvestigationContext(snapshot({
      ...canonical(),
      universalRelationshipEvaluations: [evaluation],
    }), "Explain this unresolved relationship and its evidence gap");
    const citationId = stableCitationId("evaluation", `${evaluation.ruleId}:${evaluation.evaluatedAt}`);

    expect(packet.unresolvedEvaluations).toContainEqual(expect.objectContaining({ citationId, reasonCode: "linkage-evidence-not-found" }));
    expect(packet.citations).toContainEqual(expect.objectContaining({
      citationId,
      kind: "evaluation",
      summary: expect.stringContaining("No approved linkage evidence was found."),
    }));
  });

  it("does not leave unresolved-evaluation evidence citations dangling after trimming", () => {
    const evaluation = {
      ruleId: "CB_REQUIREMENT_SET_TO_CONFIGIT_MODEL" as const,
      relationshipType: "requirement-set-model-link",
      status: "unresolved" as const,
      sourceApplication: "codebeamer",
      sourceKinds: ["requirement-set"],
      targetApplication: "configit",
      targetKinds: ["model"],
      sourceCandidates: [],
      targetCandidates: [],
      compatibleSourceCandidates: [],
      compatibleTargetCandidates: [],
      sourceCandidateCount: 0,
      targetCandidateCount: 0,
      sourceCandidatesTruncated: false,
      targetCandidatesTruncated: false,
      observedSourceKinds: [],
      observedTargetKinds: [],
      evidenceIds: ["evidence:zzz"],
      reasonCode: "linkage-evidence-not-found" as const,
      reason: "No approved linkage evidence was found.",
      technicalContext: {
        integrationName: "fixture",
        protocol: "fixture",
        direction: "codebeamer to configit",
        sourceObjectType: "requirement-set",
        targetObjectType: "model",
        documentation: [],
      },
      evaluatedAt: temporal.assembledAt,
    };
    const value = {
      ...canonical(),
      evidence: [
        { id: "evidence:aaa", kind: "source-record", summary: "Unrelated source record", source: "windchill", provenance: relation.provenance, temporal },
        { id: "evidence:zzz", kind: "source-record", summary: "Archived ledger entry", source: "codebeamer", provenance: relation.provenance, temporal },
      ],
      universalRelationshipEvaluations: [evaluation],
    };
    const packet = buildInvestigationContext(
      snapshot(value),
      "Why is this unresolved?",
      { maxItemsPerCategory: 1 },
    );
    const retainedEvidenceCitationIds = new Set(packet.evidence.map((item) => item.citationId));

    expect(packet.unresolvedEvaluations).toHaveLength(1);
    expect(packet.unresolvedEvaluations[0].evidenceCitationIds.every((id) => retainedEvidenceCitationIds.has(id))).toBe(true);
  });

  it("keeps oversized relationship omission metadata within the context limit", () => {
    const manyRelationships = Array.from({ length: 30 }, (_, index) => link(
      `relationship-${String(index).padStart(2, "0")}-${"x".repeat(90)}`,
      windchillPart.id,
      sapMaterial.id,
    ));
    const packet = buildInvestigationContext(
      snapshot(canonical([windchillPart, sapMaterial], manyRelationships)),
      "Trace OR:wt.part.WTPart:1001",
      { maxContextChars: 4_500, maxItemsPerCategory: 1 },
    );

    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(4_500);
    expect(packet.omissions.omittedCounts.relationships).toBeGreaterThan(0);
  });

  it("is deterministic and discloses omissions when bounded", () => {
    const many = Array.from({ length: 80 }, (_, index) => entity(`entity:${index}`, "windchill", `native-${index}`, `Component ${index}`, `PN-${index}`));
    const value = canonical(many);
    const options = { maxContextChars: 7000, maxItemsPerCategory: 50 };
    const first = buildInvestigationContext(snapshot(value), "Find PN-79", options);
    const second = buildInvestigationContext(snapshot(value), "Find PN-79", options);
    expect(first).toEqual(second);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(options.maxContextChars);
    expect(first.omissions.categories).toContain("entities");
    expect(first.omissions.omittedCounts.entities).toBeGreaterThan(0);
  });
});
