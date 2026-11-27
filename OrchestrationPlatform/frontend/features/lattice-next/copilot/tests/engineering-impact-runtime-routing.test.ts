import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  mapEngineeringImpactRuntimeCall,
  mapEngineeringImpactRuntimeOutcome,
  readEngineeringImpactRuntimeRoutingConfiguration,
  routeEngineeringImpactAnswer,
  type EngineeringImpactRuntimeRoutingConfiguration,
} from "../engineering-impact-runtime-routing";

const readyConfiguration: EngineeringImpactRuntimeRoutingConfiguration = {
  enabled: true,
  runtimeEndpointAvailable: true,
  runtimeCredentialProviderAvailable: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("engineering impact runtime routing", () => {
  it("defaults the server-side feature flag to disabled", () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "");

    expect(readEngineeringImpactRuntimeRoutingConfiguration()).toMatchObject({
      enabled: false,
      runtimeEndpointAvailable: false,
      runtimeCredentialProviderAvailable: false,
    });
  });

  it("enables runtime routing by default in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "");

    const configuration = readEngineeringImpactRuntimeRoutingConfiguration({
      endpointConfigured: true,
      credentialProviderConfigured: true,
    });

    expect(configuration.enabled).toBe(true);
    expect(routeEngineeringImpactAnswer(
      { question: "Summarize this investigation.", investigationId: "INV-123" },
      configuration,
    )).toEqual({ route: "runtime" });
  });

  it("keeps a supported explicit impact question on the existing path when disabled", () => {
    const route = routeEngineeringImpactAnswer(
      { question: "What is impacted if Requirement R-123 changes?", investigationId: "INV-123" },
      { ...readyConfiguration, enabled: false },
    );

    expect(route).toEqual({ route: "legacy" });
  });

  it.each([
    "Tell me about R-123.",
    "Summarize this investigation.",
    "What applications are connected?",
    "What is the Configit work-item status?",
    "What is the Configit rule expression?",
    "What evidence exists across systems?",
  ])("routes investigation questions through the runtime: %s", (question) => {
    expect(routeEngineeringImpactAnswer(
      { question, investigationId: "INV-123" },
      readyConfiguration,
    )).toEqual({ route: "runtime" });
  });

  it.each([
    "What is impacted?",
    "What is impacted if R-123 or R-456 changes?",
    "Why is it impacted?",
  ])("routes impact intent to runtime so it can resolve or clarify without legacy fallback: %s", (question) => {
    expect(routeEngineeringImpactAnswer(
      { question, investigationId: "INV-123" },
      readyConfiguration,
    )).toEqual({ route: "runtime" });
  });

  it("does not route without an active investigation", () => {
    expect(routeEngineeringImpactAnswer(
      { question: "What is impacted if R-123 changes?", investigationId: null },
      readyConfiguration,
    )).toEqual({ route: "legacy" });
  });

  it("blocks enabled routing when the endpoint or server credential provider is unavailable", () => {
    expect(routeEngineeringImpactAnswer(
      { question: "What is impacted if R-123 changes?", investigationId: "INV-123" },
      { ...readyConfiguration, runtimeEndpointAvailable: false },
    )).toEqual({
      route: "blocked",
      failureCode: "ai-runtime-rollout-blocked",
      message: "Engineering impact answers are temporarily unavailable while the runtime connection is being configured.",
    });

    expect(routeEngineeringImpactAnswer(
      { question: "What is impacted if R-123 changes?", investigationId: "INV-123" },
      { ...readyConfiguration, runtimeCredentialProviderAvailable: false },
    )).toMatchObject({ route: "blocked", failureCode: "ai-runtime-rollout-blocked" });
  });

  it("selects the runtime when impact intent and server readiness gates pass", () => {
    expect(routeEngineeringImpactAnswer(
      { question: "Show the downstream engineering impact of R-123.", investigationId: "INV-123" },
      readyConfiguration,
    )).toEqual({ route: "runtime" });
  });

  it("maps_answer_to_one_assistant_message_with_supported_citations", () => {
    const citation = {
      citationId: "cite:source:sap%3AMAT-200",
      kind: "source" as const,
      label: "SAP MAT-200",
      source: "SAP",
      nativeId: "MAT-200",
    };

    const presentation = mapEngineeringImpactRuntimeOutcome({
      disposition: "Answer",
      summary: "Requirement R-123 is linked to an operational material.",
      impacts: [{
        explanation: "The linked material is SAP MAT-200.",
        sourceIds: [citation.citationId, "missing-source"],
      }],
      citations: [
        citation,
        {
          citationId: "cite:source:unreferenced",
          kind: "source",
          label: "Unreferenced source",
        },
        {
          citationId: "uninspectable-source-id",
          kind: "source",
          label: "Uninspectable source",
        },
      ],
    });

    expect(presentation.status).toBe("answer");
    expect(presentation.assistantMessage).toEqual({
      role: "assistant",
      content: [
        "Requirement R-123 is linked to an operational material.",
        "The linked material is SAP MAT-200. (cite:source:sap%3AMAT-200)",
      ].join("\n\n"),
    });
    expect(presentation.citations).toEqual([citation]);
  });

  it("maps_clarification_and_abstention_to_visible_non_answers", () => {
    const clarification = mapEngineeringImpactRuntimeOutcome({
      disposition: "Clarify",
      issues: [{ message: "Select one explicit requirement identifier." }],
    });
    const abstention = mapEngineeringImpactRuntimeOutcome({
      disposition: "Abstain",
      issues: [{ message: "The available evidence does not support an impact answer." }],
    });

    expect(clarification).toMatchObject({
      status: "clarification",
      assistantMessage: {
        role: "assistant",
        content: "Select one explicit requirement identifier.",
      },
      citations: [],
    });
    expect(abstention).toMatchObject({
      status: "abstention",
      assistantMessage: {
        role: "assistant",
        content: "The available evidence does not support an impact answer.",
      },
      citations: [],
    });
  });

  it("maps_denial_and_failure_without_legacy_fallback", () => {
    const denied = mapEngineeringImpactRuntimeOutcome({ disposition: "Deny" });
    const unavailable = mapEngineeringImpactRuntimeOutcome({ disposition: "Failed" });

    expect(denied).toMatchObject({
      status: "denied",
      assistantMessage: {
        role: "assistant",
        content: "You are not authorized to access this investigation.",
      },
      citations: [],
    });
    expect(unavailable).toMatchObject({
      status: "unavailable",
      assistantMessage: {
        role: "assistant",
        content: "Engineering impact answers are temporarily unavailable.",
      },
      citations: [],
    });
    expect("legacyAnswer" in denied).toBe(false);
    expect("legacyAnswer" in unavailable).toBe(false);
  });

  it("omits_uninspectable_source_references", () => {
    const presentation = mapEngineeringImpactRuntimeOutcome({
      disposition: "Answer",
      summary: "A supported answer.",
      impacts: [{
        explanation: "The linked item is affected.",
        sourceIds: ["raw-source-id", "cite:source:known"],
      }],
      citations: [
        {
          citationId: "raw-source-id",
          kind: "source",
          label: "Raw source",
        },
        {
          citationId: "cite:source:unreferenced",
          kind: "source",
          label: "Unreferenced source",
        },
      ],
    });

    expect(presentation.citations).toEqual([]);
    expect(presentation.assistantMessage.content).not.toContain("(cite:");
  });

  it("keeps malformed empty outcomes visible without turning them into answers", () => {
    expect(mapEngineeringImpactRuntimeOutcome({
      disposition: "Answer",
      summary: null,
      impacts: [],
      citations: [],
    })).toMatchObject({
      status: "unavailable",
      assistantMessage: {
        role: "assistant",
        content: "The runtime did not provide a usable impact summary.",
      },
      citations: [],
    });

    expect(mapEngineeringImpactRuntimeOutcome({
      disposition: "Clarify",
      issues: [],
    }).assistantMessage.content).toBe("Please identify the requirement or item you want to assess.");
  });

  it("shows a runtime retrieval failure message without converting it into an investigation answer", () => {
    const answer = mapEngineeringImpactRuntimeCall({
      status: "response",
      response: {
        investigationId: "INV-123",
        requestContext: { requestId: "request-1", traceId: "trace-1" },
        disposition: "Failed",
        summary: null,
        impacts: [],
        facts: [],
        applicationContexts: [],
        sourceEvidence: [],
        sources: [],
        issues: [{
          code: "source-evidence-unavailable",
          message: "Source evidence retrieval is unavailable.",
        }],
      },
    }, 7);

    expect(answer).toMatchObject({
      answer: "Source evidence retrieval is unavailable.",
      claims: [],
      runtime: {
        disposition: "Failed",
        issues: [{ code: "source-evidence-unavailable" }],
      },
    });
  });

  it("reports a runtime request timeout accurately instead of implying configuration is pending", () => {
    const answer = mapEngineeringImpactRuntimeCall({
      status: "unavailable",
      code: "runtime-request-timeout",
    }, 7);

    expect(answer).toMatchObject({
      answer: "The engineering impact runtime request timed out before it returned an answer.",
      runtime: {
        disposition: "Unavailable",
        diagnosticCode: "runtime-request-timeout",
      },
    });
  });

  it("maps detailed runtime impacts and source links into the existing Copilot answer contract", () => {
    const answer = mapEngineeringImpactRuntimeCall({
      status: "response",
      response: {
        investigationId: "INV-123",
        requestContext: { requestId: "request-1", traceId: "trace-1", conversationId: "thread-1", turnId: "turn-1" },
        disposition: "Answer",
        summary: "Requirement R-123 has a direct material impact and an indirect cross-system path.",
        impacts: [{
          claimId: "impact-1",
          explanation: "Direct impact: the linked material is SAP MAT-200.",
          evidenceIds: ["evidence-1"],
          sourceIds: ["citation-1", "provenance-1"],
        }, {
          claimId: "impact-2",
          explanation: "Indirect impact: the downstream Windchill record may require review through the cross-system relationship.",
          evidenceIds: ["evidence-2"],
          sourceIds: ["citation-2"],
        }],
        sources: [{
          evidenceId: "evidence-1",
          sourceType: "record",
          sourceSystem: "SAP",
          recordId: "MAT-200",
          provenanceId: "provenance-1",
          authority: "PLM Brain",
          provider: "SAP",
          authorizationDecisionId: "decision-1",
          citationId: "citation-1",
          deepLink: "https://plm.example/records/MAT-200",
        }, {
          evidenceId: "evidence-2",
          sourceType: "record",
          sourceSystem: "Windchill",
          recordId: "WT-9001",
          provenanceId: "provenance-2",
          authority: "PLM Brain",
          provider: "Windchill",
          authorizationDecisionId: "decision-1",
          citationId: "citation-2",
          deepLink: "https://plm.example/records/WT-9001",
        }],
        issues: [{
          code: "partial-evidence",
          message: "Indirect paths are not available in the current evidence package.",
          claimId: "impact-1",
        }],
        contextPackageId: "context-1",
        semanticSupportStatus: "partial",
      },
    }, 7);

    expect(answer).toMatchObject({
      snapshotRevision: 7,
      runtime: {
        disposition: "Answer",
        contextPackageId: "context-1",
        semanticSupportStatus: "partial",
        issues: [{ code: "partial-evidence", claimId: "impact-1" }],
      },
      uncertainties: ["Indirect paths are not available in the current evidence package."],
      claims: [{
        text: "Direct impact: the linked material is SAP MAT-200.",
        kind: "fact",
        citationIds: ["cite:source:citation-1"],
      }, {
        text: "Indirect impact: the downstream Windchill record may require review through the cross-system relationship.",
        kind: "fact",
        citationIds: ["cite:source:citation-2"],
      }],
    });
    expect(answer.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        citationId: "cite:source:citation-1",
        label: "SAP MAT-200",
        deepLink: "https://plm.example/records/MAT-200",
      }),
      expect.objectContaining({
        citationId: "cite:source:citation-2",
        label: "Windchill WT-9001",
        deepLink: "https://plm.example/records/WT-9001",
      }),
    ]));
    expect(answer.answer).toContain("(cite:source:citation-1)");
    expect(answer.answer).toContain("(cite:source:citation-2)");
    expect(answer.answer).toContain("Indirect paths are not available in the current evidence package.");
  });

  it("maps exact facts and application participation only when their response sources are present", () => {
    const answer = mapEngineeringImpactRuntimeCall({
      status: "response",
      response: {
        investigationId: "INV-123",
        requestContext: { requestId: "request-1", traceId: "trace-1" },
        disposition: "Answer",
        summary: "Requirement R-123 has a supported impact.",
        impacts: [{
          claimId: "impact-1",
          explanation: "The linked part may be affected.",
          evidenceIds: ["impact-evidence-1"],
          sourceIds: ["impact-citation-1"],
        }],
        facts: [{
          factId: "fact-weight-1",
          exactValue: 2.5,
          exactValueJson: "2.50",
          evidenceIds: ["fact-evidence-1"],
          sourceIds: ["fact-citation-1"],
        }, {
          factId: "unmapped-fact",
          exactValue: "unsupported",
          evidenceIds: ["missing-evidence"],
          sourceIds: ["missing-citation"],
        }],
        applicationContexts: [{
          candidateId: "participation-1",
          evidenceIds: ["participation-evidence-1"],
          sourceIds: ["participation-citation-1"],
        }],
        sources: [{
          evidenceId: "impact-evidence-1",
          sourceType: "record",
          sourceSystem: "SAP",
          recordId: "MAT-200",
          provenanceId: "impact-provenance-1",
          authority: "PLM Brain",
          provider: "SAP",
          authorizationDecisionId: "decision-1",
          citationId: "impact-citation-1",
        }, {
          evidenceId: "fact-evidence-1",
          sourceType: "engineering-fact",
          sourceSystem: "Windchill",
          recordId: "WT-123",
          provenanceId: "fact-provenance-1",
          authority: "SourceAuthoritative",
          provider: "Windchill",
          authorizationDecisionId: "decision-1",
          citationId: "fact-citation-1",
        }, {
          evidenceId: "participation-evidence-1",
          sourceType: "application-participation",
          sourceSystem: "Windchill",
          recordId: "WT-123",
          provenanceId: "participation-provenance-1",
          authority: "SourceAuthoritative",
          provider: "Windchill",
          authorizationDecisionId: "decision-1",
          citationId: "participation-citation-1",
        }],
        issues: [],
      },
    }, 7);

    expect(answer.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: "Fact fact-weight-1: 2.50",
        kind: "fact",
        citationIds: ["cite:source:fact-citation-1"],
      }),
      expect.objectContaining({
        text: "Application participation: Windchill WT-123.",
        kind: "fact",
        citationIds: ["cite:source:participation-citation-1"],
      }),
    ]));
    expect(answer.claims.some((claim) => claim.text.includes("unmapped-fact"))).toBe(false);
    expect(answer.citations?.map((citation) => citation.citationId)).toEqual(expect.arrayContaining([
      "cite:source:fact-citation-1",
      "cite:source:participation-citation-1",
    ]));
  });

  it.each([
    ["denied", "Deny"],
    ["unavailable", "Unavailable"],
    ["failed", "Failed"],
  ] as const)("maps runtime %s to a single answer payload without fallback", (status, disposition) => {
    const answer = mapEngineeringImpactRuntimeCall(
      status === "denied"
        ? { status }
        : { status, code: "runtime-test-failure" },
      7,
    );
    expect(answer.runtime?.disposition).toBe(disposition);
    expect(answer.snapshotRevision).toBe(7);
    expect(answer.citations).toEqual([]);
    expect("legacyAnswer" in answer).toBe(false);
  });
});
