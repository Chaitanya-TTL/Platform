import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AzureChatRequest } from "../azure-openai-client";
import { COPILOT_EVALUATION_CASES } from "../evals/cases";
import { buildInvestigationContext, engineeringPromptPayload } from "../context-builder";
import type { InvestigationId } from "../../kernel/contracts/investigation-identity";
import type { CopilotConversationStore } from "../../kernel/ports/copilot-conversation-store";
import { fixtureChunk, fixturePrincipal } from "../retrieval/tests/fixtures/retrieval-fixtures";
import { fixtureAccessPolicy } from "../retrieval/tests/fixture-access-policy";
import { InMemoryRetrievalIndex } from "../retrieval/tests/in-memory-retrieval-index";

const mocks = vi.hoisted(() => ({
  relationshipGuidanceUnavailable: false,
  retrievalConfidenceBelowThreshold: false,
  graphError: undefined as unknown,
  appendTurnError: undefined as unknown,
  relationshipEstablishedForRepair: false,
  stageRecords: [] as Record<string, unknown>[],
  persistedAnswers: [] as unknown[],
  retrievalRuntime: undefined as unknown,
  retrievalRuntimeCalls: 0,
  loadSnapshot: vi.fn(),
  completeCopilotTurn: vi.fn(),
}));
const currentInvestigationSnapshotPath = resolve(
  process.cwd(),
  ".lattice-data",
  "investigations",
  "lattice-d01a7eec-f398-4e2e-a48d-1c875ff77a96",
  "snapshot.json",
);

vi.mock("server-only", () => ({}));
vi.mock("../../kernel/server/server-kernel-runtime", () => ({
  serverKernel: { load: (...args: unknown[]) => mocks.loadSnapshot(...args) },
}));
vi.mock("../../plm-brain/universal/ensure-investigation-knowledge-graph", () => ({
  ensureInvestigationKnowledgeGraph: (snapshot: unknown) => {
    if (mocks.graphError !== undefined) throw mocks.graphError;
    if (mocks.relationshipGuidanceUnavailable) throw new Error("Relationship guidance unavailable");
    return snapshot;
  },
}));
vi.mock("../../kernel/server/file-copilot-conversation-store", () => ({
  FileCopilotConversationStore: class implements CopilotConversationStore {
    async listThreads() {
      return [];
    }

    async loadThread() {
      return undefined;
    }

    async createThread(investigationId: InvestigationId, threadId: string, title: string) {
      const now = new Date().toISOString();
      return { investigationId, threadId, title, threadRevision: 0, createdAt: now, updatedAt: now, messages: [] };
    }

    async appendUserMessage(
      investigationId: InvestigationId,
      threadId: string,
      _expectedThreadRevision: number,
      message: string,
      snapshotRevision: number,
      occurredAt?: string,
      idempotencyKey?: string,
    ) {
      const now = occurredAt ?? new Date().toISOString();
      return {
        investigationId,
        threadId,
        title: message.slice(0, 160),
        threadRevision: 1,
        createdAt: now,
        updatedAt: now,
        messages: [{ role: "user" as const, content: message, at: now, snapshotRevision, idempotencyKey }],
      };
    }

    async appendTurn(
      investigationId: InvestigationId,
      threadId: string,
      _expectedThreadRevision: number,
      userMessage: string,
      assistantTurn: Parameters<CopilotConversationStore["appendTurn"]>[4],
    ) {
      if (mocks.appendTurnError !== undefined) throw mocks.appendTurnError;
      mocks.persistedAnswers.push(assistantTurn.answer);
      const now = assistantTurn.at;
      return {
        investigationId,
        threadId,
        title: userMessage.slice(0, 160),
        threadRevision: 2,
        createdAt: now,
        updatedAt: now,
        messages: [
          { role: "user" as const, content: userMessage, at: now, snapshotRevision: assistantTurn.snapshotRevision, idempotencyKey: assistantTurn.idempotencyKey },
          { role: "assistant" as const, ...assistantTurn },
        ],
      };
    }
  },
}));
vi.mock("../context-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../context-builder")>();
  return {
    ...actual,
    buildInvestigationContext: (...args: Parameters<typeof actual.buildInvestigationContext>) => {
      const relationshipDocument = readFileSync(resolve(process.cwd(), "..", "docs", "relationships.md"), "utf8");
      const packet = actual.buildInvestigationContext(args[0], args[1], {
        ...args[2],
        relationshipDocument,
      });
      const state = packet.consequenceEvidenceState;
      const source = state?.sourceEntityId
        ? packet.entities.find((entity) => entity.entityId === state.sourceEntityId)
        : undefined;
      const target = state?.targetEntityId
        ? packet.entities.find((entity) => entity.entityId === state.targetEntityId)
        : undefined;
      const relationshipCitationId = "cite:relationship:m2-established-for-repair";
      const adjustedPacket = mocks.relationshipEstablishedForRepair && state && source && target
        ? {
            ...packet,
            consequenceEvidenceState: {
              ...state,
              ontologyRelationshipEstablished: true,
              allowedConclusion: "insufficient-evidence" as const,
              allowedCitationIds: [...new Set([...state.allowedCitationIds, relationshipCitationId])],
              resolvedRelationshipCitationIds: [relationshipCitationId],
            },
            relationships: [
              ...packet.relationships,
              {
                relationshipId: "m2-established-for-repair",
                citationId: relationshipCitationId,
                category: "ontology-resolved" as const,
                kind: "operationally-represented-as",
                family: "WC_PART_TO_SAP_MATERIAL",
                sourceEntityId: source.entityId,
                sourceCitationId: source.citationId,
                targetEntityId: target.entityId,
                targetCitationId: target.citationId,
                evidenceCitationIds: [],
                semanticGuidanceAvailable: true,
                identitySupported: true,
                assertion: "fact",
                status: "resolved",
                strength: "high",
              },
            ],
            citations: [
              ...packet.citations,
              {
                citationId: relationshipCitationId,
                kind: "relationship" as const,
                label: "Established Windchill-to-SAP relationship",
              },
            ],
          }
        : packet;
      return {
        ...adjustedPacket,
        retrievalConfidence: {
          ...adjustedPacket.retrievalConfidence,
          belowThreshold: mocks.retrievalConfidenceBelowThreshold,
        },
      };
    },
  };
});
vi.mock("../azure-openai-client", () => ({
  completeCopilotTurn: (...args: unknown[]) => mocks.completeCopilotTurn(...args),
}));
vi.mock("../retrieval/retrieval-runtime", () => ({
  getDocumentRetrievalRuntime: () => {
    mocks.retrievalRuntimeCalls += 1;
    return mocks.retrievalRuntime;
  },
}));
vi.mock("../turn-stage-journal", () => ({
  recordCopilotTurnStage: (...args: [Record<string, unknown>]) => {
    const record = { ...args[0] };
    const error = record.error;
    delete record.error;
    record.errorName = error instanceof Error ? error.name : null;
    record.errorMessage = error instanceof Error
      ? error.message
          .replace(/(api[-_ ]?key|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
          .replace(/https?:\/\/\S+/gi, "[redacted-url]")
      : null;
    mocks.stageRecords.push(record);
    return Promise.resolve();
  },
}));

import { executeCopilotTurn } from "../execute-copilot-turn";

const supportedCase = COPILOT_EVALUATION_CASES.find((item) => item.id === "supported-cross-system-consequence")!;
const providerQuestion = "What operational consequence follows from Windchill OR:wt.part.WTPart:9001 being represented as SAP MAT-200?";
const m2Question = "What operational consequence follows from this Windchill part being represented as a SAP material?";
const m2EvaluationTimestamp = "2026-10-22T08:00:00.000Z";
const m2EndpointCandidate = {
  application: "windchill" as const,
  kind: "part",
  displayName: "Windchill part OR:wt.part.WTPart:9001",
  nativeId: "OR:wt.part.WTPart:9001",
  identityProperties: {},
};
const m2SapCandidate = {
  ...m2EndpointCandidate,
  application: "sap" as const,
  kind: "material-master",
  displayName: "SAP material MAT-200",
  nativeId: "MAT-200",
};
const m2NoEvidenceSnapshot = {
  ...supportedCase.snapshot,
  canonical: {
    ...supportedCase.snapshot.canonical!,
    value: {
      ...supportedCase.snapshot.canonical!.value,
      relationships: [],
      knowledgeGraph: undefined,
      universalRelationshipEvaluations: [{
        ruleId: "WC_PART_TO_SAP_MATERIAL" as const,
        relationshipType: "operationally-represented-as",
        status: "unresolved" as const,
        sourceApplication: "windchill",
        sourceKinds: ["part"],
        targetApplication: "sap",
        targetKinds: ["material-master"],
        sourceCandidates: [{ ...m2EndpointCandidate, entityId: "wc:part" }],
        targetCandidates: [{ ...m2SapCandidate, entityId: "sap:material" }],
        compatibleSourceCandidates: [{ ...m2EndpointCandidate, entityId: "wc:part" }],
        compatibleTargetCandidates: [{ ...m2SapCandidate, entityId: "sap:material" }],
        sourceCandidateCount: 1,
        targetCandidateCount: 1,
        sourceCandidatesTruncated: false,
        targetCandidatesTruncated: false,
        observedSourceKinds: ["part"],
        observedTargetKinds: ["material-master"],
        evidenceIds: [],
        reasonCode: "linkage-evidence-not-found" as const,
        reason: "No linkage evidence was found for the requested relationship.",
        technicalContext: {
          integrationName: "Synthetic fixture",
          protocol: "REST",
          direction: "read",
          sourceObjectType: "WTPart",
          targetObjectType: "MaterialMaster",
          documentation: [],
        },
        evaluatedAt: m2EvaluationTimestamp,
      }],
    },
  },
};
const m2EndpointLabelSnapshot = {
  ...m2NoEvidenceSnapshot,
  canonical: {
    ...m2NoEvidenceSnapshot.canonical!,
    value: {
      ...m2NoEvidenceSnapshot.canonical!.value,
      entities: m2NoEvidenceSnapshot.canonical!.value.entities.map((entity) =>
        entity.id === "wc:part"
          ? {
              ...entity,
              kind: "part-occurrence",
              displayName: "Steering",
              properties: {
                ...entity.properties,
                partNumber: { type: "text", text: "0000003874" },
              },
              provenance: {
                ...entity.provenance,
                source: "windchill" as const,
                nativeId: "0000003874/0000003874#0",
              },
            }
          : entity.id === "sap:material"
            ? {
                ...entity,
                kind: "material-master",
                displayName: "Steering",
                properties: {
                  ...entity.properties,
                  materialNumber: { type: "text", text: "MAT7893" },
                },
                provenance: {
                  ...entity.provenance,
                  source: "sap" as const,
                  nativeId: "MAT7893",
                },
              }
            : entity,
      ),
    },
  },
};
const providerTestSnapshot = {
  ...supportedCase.snapshot,
  canonical: {
    ...supportedCase.snapshot.canonical!,
    value: {
      ...supportedCase.snapshot.canonical!.value,
      evidence: [
        ...supportedCase.snapshot.canonical!.value.evidence,
        ...supportedCase.snapshot.canonical!.value.evidence,
      ],
    },
  },
};

function configureProviderResponse(): void {
  mocks.completeCopilotTurn.mockImplementation(async (request: AzureChatRequest) => {
    const userMessage = JSON.parse(request.messages.at(-1)!.content) as {
      consequenceEvidenceState?: unknown;
      requestedEntities?: { displayName: string; citationId: string }[];
      unresolvedEvaluations?: { citationId: string }[];
      product360PreContext?: {
        subject: { displayName: string };
        applicationPrimer: { application: string; contribution: string }[];
        applicationManifest: {
          application: string;
          representativeDisplayLabel: string;
          representativeCitationId: string;
          semanticKind: string;
          semanticRole?: string;
          drillDownCategories: { label: string; key: string }[];
        }[];
        verifiedRelationships: {
          sourceApplication: string;
          sourceLabel: string;
          targetApplication: string;
          targetLabel: string;
          kind: string;
          citationId: string;
        }[];
        evidenceBoundary: string;
      };
    };
    const snapshotRevision = request.turnContext.snapshotRevision;
    if (userMessage.product360PreContext) {
      const { subject, applicationManifest } = userMessage.product360PreContext;
      return {
        content: JSON.stringify({
          answer: [
            `Investigation subject and scope: ${subject.displayName}.`,
            ...applicationManifest.map((entry) =>
              `${entry.application} view: ${entry.representativeDisplayLabel} (${entry.semanticKind}).`,
            ),
            "Verified governed relationships are limited to the relationships selected by Lattice.",
            "Evidence boundaries: shared subject participation is not a direct relationship.",
            "Available drill-down areas are listed in the Product 360 context.",
          ].join("\n\n"),
          claims: [],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision,
        }),
      };
    }
    if (userMessage.consequenceEvidenceState) {
      const source = userMessage.requestedEntities?.[0];
      const target = userMessage.requestedEntities?.[1];
      const citationIds = [
        ...(userMessage.requestedEntities ?? []).map((entity) => entity.citationId),
        ...(userMessage.unresolvedEvaluations ?? []).map((evaluation) => evaluation.citationId),
      ];
      return {
        content: JSON.stringify({
          answer: `The available evidence does not establish that the ${source?.displayName ?? "source record"} is operationally represented as the ${target?.displayName ?? "target record"}. Therefore, no operational consequence can currently be established.`,
          claims: [{
            text: "The available evidence does not establish the requested operational representation.",
            kind: "fact",
            citationIds,
          }],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision,
        }),
      };
    }
    return {
      content: JSON.stringify({
        answer: "The engineering part is represented by a SAP material, linking it to operational data.",
        claims: [],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision,
      }),
    };
  });
}

function loadSnapshotForInvestigation(
  investigationId: InvestigationId,
  snapshot: typeof providerTestSnapshot | typeof m2NoEvidenceSnapshot = providerTestSnapshot,
): void {
  mocks.loadSnapshot.mockResolvedValueOnce({
    ...snapshot,
    identity: { ...snapshot.identity, investigationId },
  });
}

beforeEach(() => {
  mocks.relationshipGuidanceUnavailable = false;
  mocks.retrievalConfidenceBelowThreshold = false;
  mocks.graphError = undefined;
  mocks.appendTurnError = undefined;
  mocks.relationshipEstablishedForRepair = false;
  mocks.stageRecords.length = 0;
  mocks.persistedAnswers.length = 0;
  mocks.retrievalRuntime = undefined;
  mocks.retrievalRuntimeCalls = 0;
  mocks.loadSnapshot.mockReset().mockResolvedValue(providerTestSnapshot);
  mocks.completeCopilotTurn.mockReset();
  configureProviderResponse();
});

describe("executeCopilotTurn E1 persistence", () => {
  it.skipIf(!existsSync(currentInvestigationSnapshotPath))(
    "persists the selected application-balanced representatives with their citations",
    async () => {
      const currentSnapshot = JSON.parse(
        readFileSync(currentInvestigationSnapshotPath, "utf8"),
      ) as Parameters<typeof buildInvestigationContext>[0];
      const question = "What are the primary entities present in this investigation?";
      const packet = buildInvestigationContext(currentSnapshot, question);
      mocks.loadSnapshot.mockResolvedValueOnce(currentSnapshot);
      mocks.completeCopilotTurn.mockResolvedValueOnce({
        content: JSON.stringify({
          answer: "The investigation includes records from four applications.",
          claims: [],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision: currentSnapshot.identity.revision,
        }),
      });

      const outcome = await executeCopilotTurn({
        investigationId: currentSnapshot.identity.investigationId,
        expectedSnapshotRevision: currentSnapshot.identity.revision,
        idempotencyKey: "e1-primary-entities-persistence",
        threadId: "e1-primary-entities-persistence",
        createIfMissing: true,
        message: question,
      });

      expect(outcome.ok).toBe(true);
      expect(mocks.persistedAnswers).toHaveLength(1);
      const persistedAnswer = mocks.persistedAnswers[0] as {
        answer: string;
        claims: { citationIds: readonly string[] }[];
      };
      const expectedSection = [
        "Primary entities",
        "- Steering System Requirements\n  requirement; Codebeamer",
        "- Steering part 0000003874\n  part-occurrence; Windchill",
        "- Material MAT7893\n  operational material; SAP",
        "- Steering, Work-item ID 305\n  product/work-item subject; Configit",
      ].join("\n");
      expect(persistedAnswer.answer).toContain(expectedSection);
      expect(persistedAnswer.answer).not.toContain("Market MRKT");
      const representativeCitationIds = packet.engineeringBrief.subjectApplicationParticipation.map(
        (participation) => participation.representativeEntity?.citationId,
      ).filter((citationId): citationId is string => Boolean(citationId));
      expect(representativeCitationIds).toHaveLength(4);
      expect(persistedAnswer.claims.flatMap((claim) => claim.citationIds))
        .toEqual(expect.arrayContaining(representativeCitationIds));
      const canonicalEntities = (
        currentSnapshot.canonical?.value as { entities?: Array<{ id: string; kind: string }> } | undefined
      )?.entities ?? [];
      expect(canonicalEntities).toContainEqual(expect.objectContaining({
        id: "configit:family:mrkt",
        kind: "configuration-family",
      }));
    },
  );

  it.skipIf(!existsSync(currentInvestigationSnapshotPath))(
    "persists Product 360 application coverage with allowlisted representative citations",
    async () => {
      const currentSnapshot = JSON.parse(
        readFileSync(currentInvestigationSnapshotPath, "utf8"),
      ) as Parameters<typeof buildInvestigationContext>[0];
      const question = "Give me a Product 360 overview.";
      const packet = buildInvestigationContext(currentSnapshot, question);
      mocks.loadSnapshot.mockResolvedValueOnce(currentSnapshot);

      const outcome = await executeCopilotTurn({
        investigationId: currentSnapshot.identity.investigationId,
        expectedSnapshotRevision: currentSnapshot.identity.revision,
        idempotencyKey: "product-360-persistence",
        threadId: "product-360-persistence",
        createIfMissing: true,
        message: question,
      });

      expect(outcome.ok).toBe(true);
      expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
      expect(mocks.persistedAnswers).toHaveLength(1);
      const persistedAnswer = mocks.persistedAnswers[0] as {
        answer: string;
        claims: { citationIds: readonly string[] }[];
      };
      const requiredSections = [
        "Cross-application synthesis",
        "Investigation subject and scope",
        "Codebeamer requirements view",
        "Windchill engineering view",
        "SAP operational/material view",
        "Configit configuration view",
        "Verified governed relationships",
        "Evidence boundaries and unavailable relationships",
        "Available drill-down areas",
      ];
      for (const section of requiredSections) {
        expect(persistedAnswer.answer).toContain(section);
      }
      for (const participation of packet.engineeringBrief.subjectApplicationParticipation) {
        const representative = participation.representativeEntity;
        expect(representative).toBeDefined();
        expect(persistedAnswer.answer).toContain(participation.application);
        expect(persistedAnswer.answer).toContain(representative!.displayLabel);
        expect(persistedAnswer.claims.flatMap((claim) => claim.citationIds))
          .toContain(representative!.citationId);
        expect(persistedAnswer.answer).toContain(representative!.citationId);
      }
      for (const applicationView of [
        "Codebeamer requirements view",
        "Windchill engineering view",
        "SAP operational/material view",
        "Configit configuration view",
      ]) {
        expect(persistedAnswer.answer).toContain(applicationView);
      }
      expect(persistedAnswer.answer).toContain(
        "This is a coverage summary of the extracted investigation. Use the listed drill-down areas to retrieve complete object inventories.",
      );
      expect(persistedAnswer.answer).toContain(
        "Steering is represented across Codebeamer, Windchill, SAP, and Configit as a requirements subject, engineering part, operational material, and configurable product/work-item",
      );
      for (const applicationView of [
        "Codebeamer requirements view",
        "Windchill engineering view",
        "SAP operational/material view",
        "Configit configuration view",
      ]) {
        const view = persistedAnswer.answer.split(`## ${applicationView}`)[1]?.split("\n## ")[0] ?? "";
        for (const subsection of [
          "Representative",
          "Key facts",
          "Selected hierarchy",
          "Source status",
          "Available drill-downs",
        ]) {
          expect(view.match(new RegExp(`### ${subsection}`, "g"))).toHaveLength(1);
        }
        for (const subsection of ["Key facts", "Selected hierarchy"]) {
          const block = view.split(`### ${subsection}`)[1]?.split("\n### ")[0] ?? "";
          for (const factLine of block.split("\n").filter((line) => line.startsWith("- "))) {
            expect(factLine).toMatch(/\(cite:[^)]+\)/);
          }
        }
      }
      expect(persistedAnswer.answer).toMatch(/## Verified governed relationships[\s\S]*### Source-authoritative/);
      expect(persistedAnswer.answer).toContain("### Subject-derived");
      expect(persistedAnswer.answer).toContain(
        "Selected evidence includes no poc-synthetic relationships, ontology-resolved relationships.",
      );
      expect(persistedAnswer.answer).not.toContain("### POC-synthetic");
      expect(persistedAnswer.answer).not.toContain("### Ontology-resolved");
      expect(persistedAnswer.answer).not.toContain("### Canonical authority not recorded");
      expect(persistedAnswer.answer.toLocaleLowerCase()).toContain("configuration families");
      expect(persistedAnswer.answer).toContain("features");
      expect(persistedAnswer.answer.toLocaleLowerCase()).toContain("rules and expressions");
      expect(persistedAnswer.answer.toLocaleLowerCase()).toContain("product/work-item details");
      expect(persistedAnswer.answer.toLocaleLowerCase()).toContain("metadata");
      expect(persistedAnswer.answer).toContain("- Partial coverage; source data may be stale");
      expect(persistedAnswer.answer).not.toContain("Source coverage is partial or unavailable");
      expect(persistedAnswer.answer).not.toContain("Source values may be stale");
      expect(persistedAnswer.answer.match(/Shared-subject participation establishes investigation scope only/g))
        .toHaveLength(1);
      expect(persistedAnswer.answer.match(
        /Customer Requirement Specifications manages Steering System Requirements\./g,
      )).toHaveLength(1);
      expect(persistedAnswer.answer).not.toContain("source-representation");
      expect(persistedAnswer.answer).toContain("Market (MRKT)");
      expect(persistedAnswer.answer).toContain("Drive Orientation");
      expect(persistedAnswer.answer).toContain("Steering Type");
      expect(persistedAnswer.answer).toContain("Evidence gaps");
      const windchillView = persistedAnswer.answer.split("## Windchill engineering view")[1]?.split("\n## ")[0] ?? "";
      expect(windchillView.split("### Key facts")[1]?.split("\n### ")[0])
        .not.toContain("Child structure available: No");
      expect(persistedAnswer.answer.split("## Evidence boundaries and unavailable relationships")[1])
        .toContain("Child structure available: No");
      expect(persistedAnswer.answer).not.toContain("configit:family:mrkt");
      expect(persistedAnswer.answer).not.toContain("configit:detail:");
      expect(persistedAnswer.answer).not.toContain("configit:feature:");
      expect(persistedAnswer.answer).not.toMatch(/\b(?:Steer|Lifec|Engin|Backi)…/);
      expect(persistedAnswer.answer).not.toMatch(/preferred Product Id|presentation Role|group Key lifecycle|Has Children: false|source-representation/);
      const answerWithoutCitations = persistedAnswer.answer.replace(/\(cite:[^)]+\)/g, "");
      expect(answerWithoutCitations).not.toMatch(/has-product-context|has-configuration-family|— manages →|— contains →/i);
      expect(persistedAnswer.answer).not.toMatch(/\.\./);
      expect(persistedAnswer.answer).not.toMatch(/\.\s+\./);
      expect(persistedAnswer.answer).not.toMatch(/\s+[.,;!?]/);
      expect(persistedAnswer.answer).not.toMatch(/<ul|<li|class=|style=/i);
      expect(persistedAnswer.answer).not.toMatch(/\b(manages|contains|has the [\w ]+ configuration family)\b.*\b\1\b/i);
      const applicationFactLimits: Record<string, number> = {
        "Codebeamer requirements view": 3,
        "Windchill engineering view": 5,
        "SAP operational/material view": 5,
        "Configit configuration view": 5,
      };
      for (const [heading, maxFacts] of Object.entries(applicationFactLimits)) {
        const view = persistedAnswer.answer.split(`## ${heading}`)[1]?.split("\n## ")[0] ?? "";
        const keyFacts = view.split("### Key facts")[1]?.split("\n### ")[0] ?? "";
        const facts = keyFacts.match(/^- /gm) ?? [];
        expect(facts.length).toBeLessThanOrEqual(maxFacts);
      }
    },
  );

  it.skipIf(!existsSync(currentInvestigationSnapshotPath))(
    "persists a Configit-focused digest without global E1 application coverage",
    async () => {
      const currentSnapshot = JSON.parse(
        readFileSync(currentInvestigationSnapshotPath, "utf8"),
      ) as Parameters<typeof buildInvestigationContext>[0];
      const question = "Tell me everything coming from Configit for this product.";
      const packet = buildInvestigationContext(currentSnapshot, question);
      mocks.loadSnapshot.mockResolvedValueOnce(currentSnapshot);

      const outcome = await executeCopilotTurn({
        investigationId: currentSnapshot.identity.investigationId,
        expectedSnapshotRevision: currentSnapshot.identity.revision,
        idempotencyKey: "configit-application-overview-persistence",
        threadId: "configit-application-overview-persistence",
        createIfMissing: true,
        message: question,
      });

      expect(outcome.ok).toBe(true);
      expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
      const providerRequest = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
      const providerPayload = JSON.parse(providerRequest.messages.at(-1)!.content) as {
        applicationOverview?: {
          application: string;
          digest?: { facts: { summary: string }[]; secondaryEntities: { label: string }[] };
        };
        questionSpecificEvidence: { entities: unknown[]; citations: { citationId: string }[] };
        product360PreContext?: unknown;
      };
      expect(providerPayload.applicationOverview?.application).toBe("configit");
      expect(providerPayload).not.toHaveProperty("product360PreContext");
      expect(providerPayload.questionSpecificEvidence.entities).toEqual([]);
      expect(providerPayload.applicationOverview?.digest?.secondaryEntities.map((entity) => entity.label).join(" "))
        .toMatch(/Market|MRKT/);

      expect(mocks.persistedAnswers).toHaveLength(1);
      const persistedAnswer = mocks.persistedAnswers[0] as {
        answer: string;
        claims: { citationIds: readonly string[] }[];
      };
      expect(persistedAnswer.answer).toContain("## Configit representative");
      expect(persistedAnswer.answer.match(/^## Configit representative$/gm)).toHaveLength(1);
      expect(persistedAnswer.answer).toContain("Status: InProgress");
      expect(persistedAnswer.answer).not.toContain("Work-item status: value InProgress");
      expect(persistedAnswer.answer).toContain("## Configuration families");
      expect(persistedAnswer.answer.match(/## Configuration families/g)).toHaveLength(1);
      expect(persistedAnswer.answer).toMatch(/Market \(MRKT\).*Drive Orientation.*Steering Type/s);
      expect(persistedAnswer.answer).toMatch(/DEN.*IND.*USA/s);
      expect(persistedAnswer.answer).toContain("## Rules and expressions");
      expect(persistedAnswer.answer).toContain("## Configit drill-down options");
      expect(persistedAnswer.answer).not.toMatch(/Primary entities|Applications Present|Codebeamer|Windchill|SAP/);

      const configitParticipation = packet.engineeringBrief.subjectApplicationParticipation.find(
        (participation) => participation.application.toLowerCase() === "configit",
      );
      expect(configitParticipation?.representativeEntity).toBeDefined();
      expect(persistedAnswer.claims.flatMap((claim) => claim.citationIds))
        .toContain(configitParticipation!.representativeEntity!.citationId);
      expect(persistedAnswer.claims.flatMap((claim) => claim.citationIds))
        .not.toContain(packet.engineeringBrief.subjectApplicationParticipation.find(
          (participation) => participation.application.toLowerCase() === "codebeamer",
        )?.representativeEntity?.citationId);
    },
  );
});

describe("executeCopilotTurn document retrieval fallback", () => {
  it("uses one graph-only provider call and records retrieval unavailability", async () => {
    const message = "What does the design document say about OR:wt.part.WTPart:9001?";
    const context = buildInvestigationContext(providerTestSnapshot, message);
    expect(context.questionIntent).toBe("document");
    expect(context.ambiguity.clarificationRequired).toBe(false);
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-retrieval-unavailable",
      threadId: "document-retrieval-unavailable",
      createIfMissing: true,
      message,
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.retrievalRuntimeCalls).toBe(1);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const payload = JSON.parse(request.messages.at(-1)!.content);
    expect(request.messages.at(-1)!.content).toBe(JSON.stringify(engineeringPromptPayload(message, context)));
    expect(payload).not.toHaveProperty("retrievedDocumentEvidence");
    expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: { reasonCode: "retrieval-dependency-unavailable" },
    }));
  });

  it.each([
    ["disabled runtime", { enabled: false }, "retrieval-disabled"],
    ["missing principal", { enabled: true }, "retrieval-principal-unavailable"],
  ] as const)("fails closed for %s", async (_label, runtime, reasonCode) => {
    mocks.retrievalRuntime = runtime;
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: `document-${reasonCode}`,
      threadId: `document-${reasonCode}`,
      createIfMissing: true,
      message: "What does the design document say about OR:wt.part.WTPart:9001?",
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: { reasonCode },
    }));
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    expect(request.messages.at(-1)!.content).not.toContain("retrievedDocumentEvidence");
    expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
  });

  it("uses only authorized, budget-retained evidence and its citation in the provider turn", async () => {
    mocks.retrievalConfidenceBelowThreshold = true;
    const message = "What does the design document say about OR:wt.part.WTPart:9001?";
    const index = new InMemoryRetrievalIndex([fixtureChunk({
      chunkId: "authorized-chunk",
      documentId: "steering-spec",
      revision: "A",
      sourceApplication: "windchill",
      sourceReference: { sourceSystem: "windchill", nativeDocumentId: "DOC-42" },
      entityIds: ["OR:wt.part.WTPart:9001"],
    }, "The design document specifies a steering torque range from 18 to 22 Nm.", 0.95)]);
    const order: string[] = [];
    const lexicalCandidates = index.lexicalCandidates.bind(index);
    const semanticCandidates = index.semanticCandidates.bind(index);
    const loadAuthorizedChunkText = index.loadAuthorizedChunkText.bind(index);
    const loadText = vi.spyOn(index, "loadAuthorizedChunkText").mockImplementation(async (...args) => {
      order.push("load-text");
      return loadAuthorizedChunkText(...args);
    });
    vi.spyOn(index, "lexicalCandidates").mockImplementation(async (...args) => {
      order.push("lexical");
      return lexicalCandidates(...args);
    });
    vi.spyOn(index, "semanticCandidates").mockImplementation(async (...args) => {
      order.push("semantic");
      return semanticCandidates(...args);
    });
    const authorizeCandidates = vi.fn(async (...args: Parameters<typeof fixtureAccessPolicy.authorizeCandidates>) => {
      order.push("authorize");
      return fixtureAccessPolicy.authorizeCandidates(...args);
    });
    const diagnosticsStore = { persist: vi.fn().mockResolvedValue(undefined) };
    mocks.retrievalRuntime = {
      enabled: true,
      principal: fixturePrincipal,
      index,
      accessPolicy: { authorizeCandidates },
      diagnosticsStore,
    };
    mocks.completeCopilotTurn.mockImplementationOnce(async (request: AzureChatRequest) => {
      const payload = JSON.parse(request.messages.at(-1)!.content);
      const evidence = payload.retrievedDocumentEvidence.evidence[0];
      expect(payload.retrievedDocumentEvidence.uncertaintyBoundary).toMatch(/document-content claims only/i);
      expect(request.messages.find((item) => item.role === "system")!.content)
        .toMatch(/retrievedDocumentEvidence may support factual claims about the cited document content only/i);
      return {
        content: JSON.stringify({
          answer: "The design document specifies a steering torque range from 18 to 22 Nm.",
          claims: [{
            text: "The design document specifies a steering torque range from 18 to 22 Nm.",
            kind: "fact",
            citationIds: [evidence.citationId],
          }],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision: request.turnContext.snapshotRevision,
        }),
      };
    });

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-retrieval-success",
      threadId: "document-retrieval-success",
      createIfMissing: true,
      message,
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(authorizeCandidates).toHaveBeenCalledTimes(1);
    expect(loadText).toHaveBeenCalledWith(["authorized-chunk"]);
    expect(order.indexOf("authorize")).toBeGreaterThan(order.indexOf("lexical"));
    expect(order.indexOf("authorize")).toBeGreaterThan(order.indexOf("semantic"));
    expect(order.indexOf("load-text")).toBeGreaterThan(order.indexOf("authorize"));
    expect(outcome.ok && outcome.answer.citations).toContainEqual(expect.objectContaining({
      citationId: "cite:retrieval-document:v1:steering-spec:A:authorized-chunk",
      kind: "retrieval-document",
    }));
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: expect.objectContaining({ reasonCode: "retrieval-succeeded", selectedCount: 1 }),
    }));
    expect(diagnosticsStore.persist).toHaveBeenCalledTimes(1);
    expect(diagnosticsStore.persist.mock.calls[0][0]).toMatchObject({
      selectedChunkIds: ["authorized-chunk"],
      selectedCount: 1,
      omissionReasonCodes: [],
    });
  });

  it("discards all retrieval state after an internal retrieval failure", async () => {
    const privateFailure = "private document text https://private.example/doc";
    const index = {
      lexicalCandidates: vi.fn().mockRejectedValue(new Error(privateFailure)),
      semanticCandidates: vi.fn().mockResolvedValue([]),
      loadAuthorizedChunkText: vi.fn(),
    };
    mocks.retrievalRuntime = {
      enabled: true,
      principal: fixturePrincipal,
      index,
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore: { persist: vi.fn().mockResolvedValue(undefined) },
    };
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-retrieval-failed",
      threadId: "document-retrieval-failed",
      createIfMissing: true,
      message: "What does the design document say about OR:wt.part.WTPart:9001?",
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    expect(JSON.stringify(request.messages)).not.toContain(privateFailure);
    expect(request.messages.at(-1)!.content).not.toContain("retrievedDocumentEvidence");
    expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: { reasonCode: "retrieval-failed", allowedCount: 0, selectedCount: 0, contextCharacters: 0 },
    }));
    expect(JSON.stringify(mocks.stageRecords)).not.toContain(privateFailure);
  });

  it("rejects provider retrieval citations when the fallback evidence allowlist is empty", async () => {
    mocks.completeCopilotTurn.mockResolvedValueOnce({
      content: JSON.stringify({
        answer: "The document specifies this torque range.",
        claims: [{
          text: "The document specifies this torque range.",
          kind: "fact",
          citationIds: ["cite:retrieval-document:v1:unavailable:A:chunk"],
        }],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: supportedCase.snapshot.identity.revision,
      }),
    });

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-retrieval-empty-allowlist",
      threadId: "document-retrieval-empty-allowlist",
      createIfMissing: true,
      message: "What does the design document say about OR:wt.part.WTPart:9001?",
    });

    expect(outcome).toMatchObject({
      ok: false,
      status: 502,
      body: { validationCategory: "citation-validation" },
    });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(mocks.persistedAnswers).toHaveLength(0);
  });

  it("falls back to graph-only when every authorized chunk is omitted by the budget", async () => {
    const text = `The design document ${"specification detail ".repeat(4_000)}`;
    const index = new InMemoryRetrievalIndex([fixtureChunk({
      chunkId: "oversized-chunk",
      documentId: "oversized-spec",
      revision: "A",
      sourceApplication: "windchill",
    }, text, 0.9)]);
    const diagnosticsStore = { persist: vi.fn().mockResolvedValue(undefined) };
    mocks.retrievalRuntime = {
      enabled: true,
      principal: fixturePrincipal,
      index,
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore,
    };
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-retrieval-budget-omitted",
      threadId: "document-retrieval-budget-omitted",
      createIfMissing: true,
      message: "What does the design document say about OR:wt.part.WTPart:9001?",
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    expect(request.messages.at(-1)!.content).not.toContain("retrievedDocumentEvidence");
    expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
    expect(diagnosticsStore.persist.mock.calls[0][0]).toMatchObject({
      selectedCount: 0,
      selectedChunkIds: [],
      omissionReasonCodes: ["retrieval-budget-exceeded"],
    });
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: expect.objectContaining({ reasonCode: "retrieval-budget-omitted", selectedCount: 0 }),
    }));
  });

  it("never loads or exposes text from denied candidates", async () => {
    const deniedText = "DENIED PRIVATE SPECIFICATION CONTENT";
    const index = new InMemoryRetrievalIndex([fixtureChunk({
      chunkId: "denied-chunk",
      documentId: "denied-spec",
      revision: "A",
      sourceApplication: "windchill",
      accessScope: {
        tenantId: fixturePrincipal.tenantId,
        classification: "restricted",
        allowedPrincipalIds: ["different-principal"],
        allowedGroupIds: [],
        policyVersion: fixturePrincipal.policyVersion,
      },
    }, deniedText, 1)]);
    const loadText = vi.spyOn(index, "loadAuthorizedChunkText");
    const diagnosticsStore = { persist: vi.fn().mockResolvedValue(undefined) };
    mocks.retrievalRuntime = {
      enabled: true,
      principal: fixturePrincipal,
      index,
      accessPolicy: fixtureAccessPolicy,
      diagnosticsStore,
    };

    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-retrieval-denied",
      threadId: "document-retrieval-denied",
      createIfMissing: true,
      message: "What does the design document say about OR:wt.part.WTPart:9001?",
    });

    expect(outcome.ok).toBe(true);
    expect(loadText).not.toHaveBeenCalled();
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    expect(JSON.stringify(request.messages)).not.toContain(deniedText);
    expect(request.messages.at(-1)!.content).not.toContain("retrievedDocumentEvidence");
    expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: expect.objectContaining({ reasonCode: "retrieval-access-denied", selectedCount: 0 }),
    }));
    expect(JSON.stringify(mocks.stageRecords)).not.toContain(deniedText);
    expect(JSON.stringify(diagnosticsStore.persist.mock.calls)).not.toContain(deniedText);
  });

  it("preserves the existing insufficient-evidence response when graph and retrieval are unavailable", async () => {
    mocks.retrievalConfidenceBelowThreshold = true;
    const outcome = await executeCopilotTurn({
      investigationId: supportedCase.snapshot.identity.investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "document-insufficient-evidence",
      threadId: "document-insufficient-evidence",
      createIfMissing: true,
      message: "What does the design document say about OR:wt.part.WTPart:9001?",
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
    expect(outcome.ok && outcome.answer.answer).toMatch(/can’t establish a reliable engineering conclusion/i);
    expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
    expect(mocks.stageRecords).toContainEqual(expect.objectContaining({
      stage: "retrieval-completed",
      retrievalOutcome: { reasonCode: "retrieval-dependency-unavailable" },
    }));
  });

  it("keeps M1 and E1 provider payloads retrieval-disabled", async () => {
    const m1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("M1"))!;
    const e1 = COPILOT_EVALUATION_CASES.find((item) => item.roadmapIds.includes("E1"))!;
    for (const [label, testCase] of [["M1", m1], ["E1", e1]] as const) {
      const investigationId = `frozen-${label.toLowerCase()}-retrieval-disabled` as InvestigationId;
      const snapshot = {
        ...testCase.snapshot,
        identity: { ...testCase.snapshot.identity, investigationId },
      };
      const providerCallsBefore = mocks.completeCopilotTurn.mock.calls.length;
      mocks.loadSnapshot.mockResolvedValueOnce(snapshot);
      const outcome = await executeCopilotTurn({
        investigationId,
        expectedSnapshotRevision: snapshot.identity.revision,
        idempotencyKey: `frozen-${label.toLowerCase()}-retrieval-disabled`,
        threadId: `frozen-${label.toLowerCase()}-retrieval-disabled`,
        createIfMissing: true,
        message: testCase.question,
      });

      expect(outcome.ok, `${label} outcome: ${JSON.stringify(outcome)}`).toBe(true);
      expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(providerCallsBefore + 1);
      const request = mocks.completeCopilotTurn.mock.calls.at(-1)![0] as AzureChatRequest;
      const payload = JSON.parse(request.messages.at(-1)!.content);
      expect(payload).not.toHaveProperty("retrievedDocumentEvidence");
      expect(outcome.ok && outcome.answer.citations?.every((citation) => citation.kind !== "retrieval-document")).toBe(true);
      expect(mocks.retrievalRuntimeCalls).toBe(0);
    }
    expect(mocks.stageRecords.some((record) => record.stage === "retrieval-completed")).toBe(false);
  });
});

describe("executeCopilotTurn relationship guidance", () => {
  it("includes_relevant_relationship_guidance_in_the_model_context", async () => {
    const investigationId = "relationship-guidance-test" as InvestigationId;
    loadSnapshotForInvestigation(investigationId, m2NoEvidenceSnapshot);
    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-guidance-test",
      threadId: "relationship-guidance-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome.ok).toBe(true);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const payload = JSON.parse(request.messages.at(-1)!.content);
    expect(payload.requestedRelationshipType).toBe("operationally-represented-as");
    expect(payload.unresolvedEvaluations).toContainEqual(expect.objectContaining({
      ruleId: "WC_PART_TO_SAP_MATERIAL",
    }));
    expect(payload.evidenceBoundary).toMatch(/does not prove operational representation/i);
  });

  it("fails_clearly_without_contacting_the_model_when_relationship_guidance_is_unavailable", async () => {
    mocks.relationshipGuidanceUnavailable = true;
    const investigationId = "relationship-guidance-failure" as InvestigationId;
    loadSnapshotForInvestigation(investigationId);

    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-guidance-failure",
      threadId: "relationship-guidance-failure-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome).toMatchObject({
      ok: false,
      status: 503,
      body: { message: expect.stringMatching(/authoritative relationship (guidance|ontology)/i) },
    });
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
  });

  it("separates_relationship_semantics_from_instance_evidence", async () => {
    const investigationId = "relationship-semantics-test" as InvestigationId;
    loadSnapshotForInvestigation(investigationId, m2NoEvidenceSnapshot);
    await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-semantics-test",
      threadId: "relationship-semantics-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const systemMessage = request.messages.find((item) => item.role === "system")!.content;
    const payload = JSON.parse(request.messages.at(-1)!.content);
    expect(systemMessage).toMatch(/relationship definitions.*do not.*prove.*specific relationship instance/i);
    expect(systemMessage).toMatch(/MAY_IMPACT.*causation/i);
    expect(payload.resolvedRelationships).toEqual([]);
    expect(payload.unresolvedEvaluations).toContainEqual(expect.objectContaining({
      ruleId: "WC_PART_TO_SAP_MATERIAL",
      reasonCode: "linkage-evidence-not-found",
    }));
    expect(payload.evidenceBoundary).toMatch(/shared investigation participation does not prove/i);
  });

  it("does_not_require_a_fixed_sentence_or_claim_count", async () => {
    const investigationId = "relationship-answer-length-test" as InvestigationId;
    loadSnapshotForInvestigation(investigationId);
    await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "relationship-answer-length-test",
      threadId: "relationship-answer-length-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const systemMessage = request.messages.find((item) => item.role === "system")!.content;
    expect(systemMessage).not.toMatch(/at most two short sentences|at most three distinct claims/i);
    expect(systemMessage).toMatch(/engineering consequence/i);
    expect(systemMessage).toMatch(/why it matters/i);
  });

  it("repairs_optional_answer_shape_before_validation", async () => {
    const investigationId = "provider-repair-test" as InvestigationId;
    loadSnapshotForInvestigation(investigationId);
    mocks.completeCopilotTurn.mockResolvedValueOnce({
      content: JSON.stringify({
        answer: "The available evidence does not establish the requested operational representation.",
        claims: [{ text: "The provider supplied an uncategorized claim." }],
        recommendations: [{ text: "Ignore this malformed recommendation.", rationale: "It has no usable citation.", approvalRequired: false }],
        snapshotRevision: supportedCase.snapshot.identity.revision,
      }),
    });

    const outcome = await executeCopilotTurn({
      investigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey: "provider-repair-test",
      threadId: "provider-repair-thread",
      createIfMissing: true,
      message: providerQuestion,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.answer.snapshotRevision).toBe(supportedCase.snapshot.identity.revision);
      expect(outcome.answer.recommendations).toHaveLength(0);
    }
  });

  it("validates and persists an insufficient-evidence M2 answer and rejects unsupported provider claims", async () => {
    mocks.loadSnapshot.mockResolvedValue(m2EndpointLabelSnapshot);
    mocks.completeCopilotTurn.mockImplementationOnce(async (request: AzureChatRequest) => {
      const payload = JSON.parse(request.messages.at(-1)!.content) as {
        consequenceEvidenceState: { allowedConclusion: string };
        citations: { citationId: string; kind: string; source?: string }[];
        unresolvedEvaluations: { citationId: string; ruleId: string }[];
      };
      const windchillCitation = payload.citations.find((citation) =>
        citation.kind === "entity" && citation.source === "windchill",
      )!;
      const sapCitation = payload.citations.find((citation) =>
        citation.kind === "entity" && citation.source === "sap",
      )!;
      const evaluation = payload.unresolvedEvaluations.find((item) =>
        item.ruleId === "WC_PART_TO_SAP_MATERIAL",
      )!;
      return {
        providerStatus: 200,
        content: JSON.stringify({
          answer: "The Windchill part is operationally represented as the SAP material.",
          claims: [
            {
              text: "The available evidence does not establish the requested operational representation.",
              kind: "fact",
              citationIds: [windchillCitation.citationId, sapCitation.citationId, evaluation.citationId],
            },
            {
              text: "The Windchill part is operationally represented as the SAP material.",
              kind: "fact",
              citationIds: [windchillCitation.citationId, sapCitation.citationId],
            },
          ],
          recommendations: [],
          uncertainties: ["The investigation contains no confirmed linkage evidence."],
          followUpQuestions: [],
          snapshotRevision: 3,
        }),
      };
    });

    const success = await executeCopilotTurn({
      investigationId: "m2-execute-integration" as InvestigationId,
      expectedSnapshotRevision: m2NoEvidenceSnapshot.identity.revision,
      idempotencyKey: "m2-insufficient-evidence-integration",
      threadId: "m2-insufficient-evidence-thread",
      createIfMissing: true,
      message: m2Question,
    });

    expect(success.ok).toBe(true);
    expect(mocks.retrievalRuntimeCalls).toBe(0);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    const successRequest = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const successPayload = JSON.parse(successRequest.messages.at(-1)!.content) as {
      consequenceEvidenceState: { allowedConclusion: string };
      requestedEntities: { citationId: string; displayName: string; source?: string }[];
      citations: { citationId: string; kind: string; source?: string }[];
      unresolvedEvaluations: { citationId: string; ruleId: string }[];
    };
    expect(successPayload.consequenceEvidenceState.allowedConclusion).toBe("insufficient-evidence");
    expect(successPayload.requestedEntities.map(({ source, displayName }) => ({ source, displayName }))).toEqual(
      expect.arrayContaining([
        { source: "windchill", displayName: "Windchill part 0000003874" },
        { source: "sap", displayName: "SAP material MAT7893" },
      ]),
    );
    const receivedStage = mocks.stageRecords.find((record) =>
      record.stage === "provider-response-received",
    );
    expect(receivedStage).toMatchObject({ providerStatus: 200 });
    const parsedStage = mocks.stageRecords.find((record) =>
      record.stage === "provider-response-parsed",
    );
    expect(parsedStage).toMatchObject({ jsonParsingResult: "passed" });
    const validatedStage = mocks.stageRecords.find((record) =>
      record.stage === "answer-validated",
    );
    expect(validatedStage).toMatchObject({
      validationOutcome: "passed",
      repairApplied: true,
      removedClaimCategories: ["operational-representation-established"],
      fallbackUsed: false,
      finalValidationCategory: null,
    });
    expect(mocks.persistedAnswers).toHaveLength(1);
    expect(mocks.persistedAnswers[0]).toMatchObject({
      answer: expect.not.stringMatching(/inventory|production|procurement|compliance|cost|disruption/i),
    });
    const persistedAnswer = mocks.persistedAnswers[0] as {
      answer: string;
      claims: { citationIds: readonly string[] }[];
      citations?: { citationId: string; kind: string }[];
    };
    expect(persistedAnswer.answer).toBe(
      "The available evidence does not establish that the Windchill part 0000003874 is operationally represented as the SAP material MAT7893. Therefore, no operational consequence can currently be established.",
    );
    expect(persistedAnswer.answer).toMatch(/available evidence does not establish/i);
    expect(persistedAnswer.answer).toMatch(/Windchill part 0000003874 is operationally represented as the SAP material MAT7893/i);
    expect(persistedAnswer.answer).toMatch(/no operational consequence can currently be established/i);
    expect(persistedAnswer.answer).not.toMatch(/Steering represented as Steering/i);
    expect(persistedAnswer.answer).not.toMatch(/\b(?:however|but)\b[^.!?]*\b(?:represented|linked|connected|dependency)\b/i);
    expect(persistedAnswer.claims).not.toContainEqual(expect.objectContaining({
      text: "The Windchill part is operationally represented as the SAP material.",
    }));
    expect(mocks.persistedAnswers).toHaveLength(1);
    const persistedCitationIds = persistedAnswer.claims.flatMap((claim) => claim.citationIds);
    const windchillCitation = successPayload.citations.find((citation) =>
      citation.kind === "entity" && citation.source === "windchill",
    )!;
    const sapCitation = successPayload.citations.find((citation) =>
      citation.kind === "entity" && citation.source === "sap",
    )!;
    const unresolvedEvaluation = successPayload.unresolvedEvaluations.find((item) =>
      item.ruleId === "WC_PART_TO_SAP_MATERIAL",
    )!;
    expect(persistedCitationIds).toEqual(expect.arrayContaining([
      windchillCitation.citationId,
      sapCitation.citationId,
      unresolvedEvaluation.citationId,
    ]));
    expect(persistedAnswer.citations?.map((citation) => citation.kind)).toContain("evaluation");
    if (success.ok) {
      expect(success.answer.answer).toMatch(/no operational consequence can currently be established/i);
      expect(success.answer.citations?.map((citation) => citation.kind)).toContain("evaluation");
      expect(success.threadRevision).toBe(2);
    }

    mocks.completeCopilotTurn.mockImplementationOnce(async (request: AzureChatRequest) => {
      const payload = JSON.parse(request.messages.at(-1)!.content) as {
        citations: { citationId: string; kind: string; source?: string }[];
        unresolvedEvaluations: { citationId: string; ruleId: string }[];
      };
      const windchillCitation = payload.citations.find((citation) =>
        citation.kind === "entity" && citation.source === "windchill",
      )!;
      const sapCitation = payload.citations.find((citation) =>
        citation.kind === "entity" && citation.source === "sap",
      )!;
      const evaluation = payload.unresolvedEvaluations.find((item) =>
        item.ruleId === "WC_PART_TO_SAP_MATERIAL",
      )!;
      return {
        providerStatus: 200,
        content: JSON.stringify({
          answer: "The available evidence does not establish the relationship, but this could cause inventory misalignment.",
          claims: [
            {
              text: "The available evidence does not establish the requested relationship.",
              kind: "fact",
              citationIds: [windchillCitation.citationId, sapCitation.citationId, evaluation.citationId, "cite:entity:invented-m2"],
            },
            {
              text: "The mismatch could cause inventory misalignment.",
              kind: "hypothesis",
              citationIds: [windchillCitation.citationId, sapCitation.citationId],
            },
          ],
          recommendations: [],
          uncertainties: [],
          followUpQuestions: [],
          snapshotRevision: 3,
        }),
      };
    });

    const invalid = await executeCopilotTurn({
      investigationId: "m2-execute-integration" as InvestigationId,
      expectedSnapshotRevision: m2NoEvidenceSnapshot.identity.revision,
      idempotencyKey: "m2-unsupported-impact-integration",
      threadId: "m2-unsupported-impact-thread",
      createIfMissing: true,
      message: m2Question,
    });

    expect(invalid).toMatchObject({
      ok: false,
      status: 502,
      body: { failureCode: "citation-validation", providerStatus: 200 },
    });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(2);
    expect(mocks.persistedAnswers).toHaveLength(1);
    const invalidStage = mocks.stageRecords.find((record) =>
      record.stage === "answer-validated" && record.validationOutcome === "failed",
    );
    expect(invalidStage).toMatchObject({
      repairApplied: false,
      removedClaimCategories: [],
      unknownCitationIds: ["cite:entity:invented-m2"],
      validationOutcome: "failed",
    });
    expect(invalidStage?.claimRequirements).toContainEqual(expect.objectContaining({
      claimType: "specific-operational-effect",
    }));
    expect(invalidStage?.errorMessage).toMatch(/unknown citation/i);
  });

  it("preserves an established M2 relationship while removing an unsupported operational effect", async () => {
    mocks.relationshipEstablishedForRepair = true;
    mocks.loadSnapshot.mockResolvedValue(m2NoEvidenceSnapshot);
    const establishedAnswer =
      "The Windchill-to-SAP relationship is established, but no operational consequence can currently be established.";
    const relationshipCitationId = "cite:relationship:m2-established-for-repair";
    mocks.completeCopilotTurn.mockImplementationOnce(async (request: AzureChatRequest) => {
      const payload = JSON.parse(request.messages.at(-1)!.content) as {
        consequenceEvidenceState: {
          ontologyRelationshipEstablished: boolean;
          specificEffectCitationIds: readonly string[];
        };
        citations: { citationId: string; kind: string; source?: string }[];
      };
      const windchillCitation = payload.citations.find((citation) =>
        citation.kind === "entity" && citation.source === "windchill",
      )!;
      const sapCitation = payload.citations.find((citation) =>
        citation.kind === "entity" && citation.source === "sap",
      )!;
      return {
        providerStatus: 200,
        content: JSON.stringify({
        answer: establishedAnswer,
        claims: [
          {
            text: "The records are operationally represented as one another.",
            kind: "fact",
            citationIds: [relationshipCitationId],
          },
          {
            text: "No operational consequence can currently be established.",
            kind: "fact",
            citationIds: [windchillCitation.citationId, sapCitation.citationId],
          },
          {
            text: "The relationship causes inventory misalignment.",
            kind: "hypothesis",
            citationIds: [relationshipCitationId],
          },
        ],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: m2NoEvidenceSnapshot.identity.revision,
        }),
      };
    });

    const outcome = await executeCopilotTurn({
      investigationId: "m2-established-relationship-integration" as InvestigationId,
      expectedSnapshotRevision: m2NoEvidenceSnapshot.identity.revision,
      idempotencyKey: "m2-established-relationship-no-effect",
      threadId: "m2-established-relationship-thread",
      createIfMissing: true,
      message: m2Question,
    });

    expect(outcome.ok).toBe(true);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    const request = mocks.completeCopilotTurn.mock.calls[0][0] as AzureChatRequest;
    const payload = JSON.parse(request.messages.at(-1)!.content) as {
      consequenceEvidenceState: {
        ontologyRelationshipEstablished: boolean;
        specificEffectCitationIds: readonly string[];
      };
    };
    expect(payload.consequenceEvidenceState).toMatchObject({
      ontologyRelationshipEstablished: true,
      specificEffectCitationIds: [],
    });
    expect(mocks.persistedAnswers).toHaveLength(1);
    const persistedAnswer = mocks.persistedAnswers[0] as {
      answer: string;
      claims: { text: string }[];
    };
    expect(persistedAnswer.answer).toBe(establishedAnswer);
    expect(persistedAnswer.claims).toContainEqual(expect.objectContaining({
      text: "The records are operationally represented as one another.",
    }));
    expect(persistedAnswer.claims).toContainEqual(expect.objectContaining({
      text: "No operational consequence can currently be established.",
    }));
    expect(persistedAnswer.claims).not.toContainEqual(expect.objectContaining({
      text: "The relationship causes inventory misalignment.",
    }));
    expect(mocks.stageRecords.find((record) =>
      record.stage === "answer-validated",
    )).toMatchObject({
      validationOutcome: "passed",
      repairApplied: true,
      removedClaimCategories: ["specific-operational-effect"],
    });
  });
});

describe("executeCopilotTurn stage diagnostics", () => {
  function runTurn(idempotencyKey: string) {
    return executeCopilotTurn({
      investigationId: `diagnostics-${idempotencyKey}` as InvestigationId,
      expectedSnapshotRevision: supportedCase.snapshot.identity.revision,
      idempotencyKey,
      threadId: `${idempotencyKey}-thread`,
      createIfMissing: true,
      message: providerQuestion,
    });
  }

  function stages() {
    return mocks.stageRecords.map((record) => record.stage);
  }

  function expectNoSecrets() {
    expect(JSON.stringify(mocks.stageRecords)).not.toContain("unit-test-secret-key");
    expect(JSON.stringify(mocks.stageRecords)).not.toContain("provider-secret");
    expect(JSON.stringify(mocks.stageRecords)).not.toContain(providerQuestion);
  }

  it("journals a pre-provider context failure and preserves its original cause", async () => {
    const originalError = new Error("Relationship guidance unavailable");
    mocks.graphError = originalError;

    const outcome = await runTurn("stage-context-failure");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "unknown-runtime-error",
        failingStage: "context-built",
        requestMayHaveBeenBilled: false,
      },
      cause: originalError,
    });
    expect(mocks.completeCopilotTurn).not.toHaveBeenCalled();
    expect(stages()).toEqual(["turn-started", "turn-failed"]);
    expect(mocks.stageRecords.at(-1)).toMatchObject({
      failureCode: "unknown-runtime-error",
      errorName: "Error",
      errorMessage: "Relationship guidance unavailable",
    });
    expectNoSecrets();
  });

  it("preserves provider network failures without retrying", async () => {
    const originalError = Object.assign(new Error("network reset api-key=unit-test-secret-key"), { code: "network-error" });
    mocks.completeCopilotTurn.mockRejectedValueOnce(originalError);

    const outcome = await runTurn("stage-network-failure");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "provider-network-error",
        failingStage: "provider-request-started",
        requestMayHaveBeenBilled: true,
        retryable: false,
      },
      cause: originalError,
    });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(stages()).toEqual(["turn-started", "context-built", "prompt-built", "provider-request-started", "turn-failed"]);
    expectNoSecrets();
  });

  it("preserves provider HTTP status and error cause", async () => {
    const originalError = Object.assign(new Error("provider rejected request"), { code: "provider-http-error", status: 401 });
    mocks.completeCopilotTurn.mockRejectedValueOnce(originalError);

    const outcome = await runTurn("stage-http-failure");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "provider-http-error",
        failingStage: "provider-response-received",
        providerStatus: 401,
        requestMayHaveBeenBilled: true,
      },
      cause: originalError,
    });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(stages()).toEqual([
      "turn-started", "context-built", "prompt-built", "provider-request-started",
      "provider-response-received", "turn-failed",
    ]);
    expectNoSecrets();
  });

  it("journals malformed model JSON without storing response content", async () => {
    const secretResponse = `invalid-json api-key=unit-test-secret-key`;
    mocks.completeCopilotTurn.mockResolvedValueOnce({ content: secretResponse, providerStatus: 200 });

    const outcome = await runTurn("stage-malformed-json");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "malformed-json",
        failingStage: "provider-response-parsed",
        validationCategory: "malformed-json",
        providerStatus: 200,
        requestMayHaveBeenBilled: true,
      },
      cause: expect.objectContaining({ name: "TurnStageError", cause: expect.any(Error) }),
    });
    expect(stages()).toEqual([
      "turn-started", "context-built", "prompt-built", "provider-request-started",
      "provider-response-received", "provider-response-parsed", "turn-failed",
    ]);
    expect(mocks.stageRecords.find((record) => record.stage === "provider-response-parsed")).toMatchObject({
      responseCharacterCount: secretResponse.length,
      jsonParsingResult: "failed",
    });
    expect(JSON.stringify(mocks.stageRecords)).not.toContain(secretResponse);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expectNoSecrets();
  });

  it("classifies schema-invalid output and retains its validation cause", async () => {
    mocks.completeCopilotTurn.mockResolvedValueOnce({
      content: JSON.stringify({
        answer: "x".repeat(16_001),
        claims: [],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: supportedCase.snapshot.identity.revision,
      }),
      providerStatus: 200,
    });

    const outcome = await runTurn("stage-schema-invalid");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "schema-validation",
        failingStage: "answer-validated",
        validationCategory: "schema-validation",
        providerStatus: 200,
      },
      cause: expect.objectContaining({ name: "CopilotAnswerValidationError" }),
    });
    expect(stages()).toContain("answer-validated");
    expect(stages().at(-1)).toBe("turn-failed");
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expectNoSecrets();
  });

  it("classifies unknown citations without silently removing them", async () => {
    mocks.completeCopilotTurn.mockResolvedValueOnce({
      content: JSON.stringify({
        answer: "A claimed fact.",
        claims: [{ text: "A claimed fact.", kind: "fact", citationIds: ["cite:unknown"] }],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: supportedCase.snapshot.identity.revision,
      }),
      providerStatus: 200,
    });

    const outcome = await runTurn("stage-invalid-citation");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "citation-validation",
        failingStage: "answer-validated",
        validationCategory: "citation-validation",
        providerStatus: 200,
      },
      cause: expect.objectContaining({ name: "CopilotAnswerValidationError" }),
    });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(mocks.stageRecords.at(-1)).toMatchObject({
      stage: "turn-failed",
      errorMessage: "claims[0].citationIds contains an unknown citation ID.",
    });
    expectNoSecrets();
  });

  it("rejects snapshot revision mismatches instead of repairing the revision", async () => {
    mocks.completeCopilotTurn.mockResolvedValueOnce({
      content: JSON.stringify({
        answer: "A response for another snapshot.",
        claims: [],
        recommendations: [],
        uncertainties: [],
        followUpQuestions: [],
        snapshotRevision: -1,
      }),
      providerStatus: 200,
    });

    const outcome = await runTurn("stage-snapshot-mismatch");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "snapshot-validation",
        failingStage: "answer-validated",
        validationCategory: "snapshot-validation",
        providerStatus: 200,
      },
      cause: expect.objectContaining({ name: "CopilotAnswerValidationError" }),
    });
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expect(mocks.stageRecords.at(-1)).toMatchObject({
      stage: "turn-failed",
      errorMessage: "Answer snapshot revision does not match the active investigation snapshot.",
    });
    expectNoSecrets();
  });

  it("records conversation persistence failure after validation without another provider call", async () => {
    const originalError = new Error("conversation store unavailable");
    mocks.appendTurnError = originalError;

    const outcome = await runTurn("stage-persistence-failure");

    expect(outcome).toMatchObject({
      ok: false,
      body: {
        failureCode: "conversation-persistence",
        failingStage: "conversation-persisted",
        requestMayHaveBeenBilled: true,
        retryable: false,
      },
      cause: originalError,
    });
    expect(stages()).toEqual([
      "turn-started", "context-built", "prompt-built", "provider-request-started",
      "provider-response-received", "provider-response-parsed", "answer-repaired",
      "answer-validated", "turn-failed",
    ]);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expectNoSecrets();
  });

  it("journals a complete validated and persisted answer", async () => {
    const outcome = await runTurn("stage-success");

    expect(outcome.ok).toBe(true);
    expect(stages()).toEqual([
      "turn-started", "context-built", "prompt-built", "provider-request-started",
      "provider-response-received", "provider-response-parsed", "answer-repaired",
      "answer-validated", "conversation-persisted", "turn-completed",
    ]);
    expect(mocks.completeCopilotTurn).toHaveBeenCalledTimes(1);
    expectNoSecrets();
  });
});
