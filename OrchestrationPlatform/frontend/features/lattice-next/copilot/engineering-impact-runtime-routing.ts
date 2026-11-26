import "server-only";
import type { CopilotAnswer, CopilotCitation, CopilotRuntimeDisposition } from "./contracts";
import {
  runtimeResponseCitations,
  type EngineeringImpactRuntimeCallResult,
  type EngineeringImpactRuntimeDisposition,
  type EngineeringImpactRuntimeResponse,
} from "./engineering-impact-runtime-client";

export interface EngineeringImpactRuntimeRoutingInput {
  question: string;
  investigationId?: string | null;
}

export interface EngineeringImpactRuntimeRoutingConfiguration {
  enabled: boolean;
  runtimeEndpointAvailable: boolean;
  runtimeCredentialProviderAvailable: boolean;
}

export type EngineeringImpactRuntimeRoute =
  | { route: "legacy" }
  | { route: "runtime" }
  | {
      route: "blocked";
      failureCode: "ai-runtime-rollout-blocked";
      message: string;
    };

export type EngineeringImpactRuntimeOutcome =
  | {
      disposition: "Answer";
      summary: string | null;
      impacts: readonly {
        explanation: string;
        sourceIds: readonly string[];
      }[];
      citations: readonly CopilotCitation[];
      contextPackageId?: string;
    }
  | {
      disposition: "Clarify" | "Abstain";
      issues: readonly { message: string }[];
      contextPackageId?: string;
    }
  | { disposition: "Deny" | "Failed" | "Unavailable"; diagnosticCode?: string };

export type EngineeringImpactCopilotStatus =
  | "answer"
  | "clarification"
  | "abstention"
  | "denied"
  | "unavailable";

export interface EngineeringImpactCopilotPresentation {
  status: EngineeringImpactCopilotStatus;
  assistantMessage: {
    role: "assistant";
    content: string;
  };
  citations: readonly CopilotCitation[];
}

const CITATION_ID = /^cite:([^:()\s]+):([^()\s]+)$/;

function citeableReferences(
  citations: readonly CopilotCitation[],
  sourceIds: ReadonlySet<string>,
): readonly CopilotCitation[] {
  return citations.filter(
    (citation) => sourceIds.has(citation.citationId) && CITATION_ID.test(citation.citationId),
  );
}

function appendCitationMarkers(
  explanation: string,
  citations: readonly CopilotCitation[],
): string {
  const markers = citations.flatMap((citation) => {
    const match = CITATION_ID.exec(citation.citationId);
    return match ? [`(cite:${match[1]}:${match[2]})`] : [];
  });
  return markers.length > 0 ? `${explanation} ${markers.join(" ")}` : explanation;
}

export function mapEngineeringImpactRuntimeOutcome(
  outcome: EngineeringImpactRuntimeOutcome,
): EngineeringImpactCopilotPresentation {
  switch (outcome.disposition) {
    case "Answer": {
      const citationIds = new Set(outcome.impacts.flatMap((impact) => impact.sourceIds));
      const citations = citeableReferences(outcome.citations, citationIds);
      const content = [
        outcome.summary?.trim(),
        ...outcome.impacts.map((impact) => {
          const explanation = impact.explanation.trim();
          const impactCitations = citations.filter((citation) =>
            impact.sourceIds.includes(citation.citationId),
          );
          return explanation
            ? appendCitationMarkers(explanation, impactCitations)
            : undefined;
        }),
      ].filter((part): part is string => Boolean(part)).join("\n\n");
      if (!content) {
        return {
          status: "unavailable",
          assistantMessage: {
            role: "assistant",
            content: "The runtime did not provide a usable impact summary.",
          },
          citations: [],
        };
      }

      return {
        status: "answer",
        assistantMessage: {
          role: "assistant",
          content,
        },
        citations,
      };
    }
    case "Clarify":
    case "Abstain": {
      const status = outcome.disposition === "Clarify" ? "clarification" : "abstention";
      const content = outcome.issues.map((issue) => issue.message.trim()).filter(Boolean).join("\n\n") ||
        (status === "clarification"
          ? "Please identify the requirement or item you want to assess."
          : "The available evidence does not support an impact answer.");
      return {
        status,
        assistantMessage: {
          role: "assistant",
          content,
        },
        citations: [],
      };
    }
    case "Deny":
      return {
        status: "denied",
        assistantMessage: {
          role: "assistant",
          content: "You are not authorized to access this investigation.",
        },
        citations: [],
      };
    case "Failed":
    case "Unavailable":
      return {
        status: "unavailable",
        assistantMessage: {
          role: "assistant",
          content: "Engineering impact answers are temporarily unavailable.",
        },
        citations: [],
      };
  }
}

function copilotDisposition(disposition: EngineeringImpactRuntimeDisposition): CopilotRuntimeDisposition {
  return disposition;
}

function mapRuntimeResponse(
  response: EngineeringImpactRuntimeResponse,
  snapshotRevision: number,
): CopilotAnswer {
  const { citations, sourceCitationIds } = runtimeResponseCitations(response);
  const factClaims = (response.facts ?? []).flatMap((fact) => {
    const citationIds = [...new Set(
      fact.sourceIds
        .map((sourceId) => sourceCitationIds.get(sourceId))
        .filter((citationId): citationId is string => Boolean(citationId)),
    )];
    if (citationIds.length === 0) return [];
    const exactValue = fact.exactValueJson ??
      JSON.stringify(fact.exactValue) ??
      String(fact.exactValue);
    return [{
      text: `Fact ${fact.factId}: ${exactValue}`,
      kind: "fact" as const,
      citationIds,
      display: `Fact ${fact.factId}: ${exactValue} ${citationIds.map(id => `(${id})`).join(" ")}`,
    }];
  });
  const applicationContextClaims = (response.applicationContexts ?? []).flatMap((applicationContext) => {
    const matchingCitations = applicationContext.sourceIds
      .map((sourceId) => {
        const citationId = sourceCitationIds.get(sourceId);
        return citationId ? citations.find((citation) => citation.citationId === citationId) : undefined;
      })
      .filter((citation): citation is CopilotCitation => Boolean(citation));
    const citationIds = [...new Set(matchingCitations.map((citation) => citation.citationId))];
    if (citationIds.length === 0) return [];
    const label = matchingCitations.map((citation) => citation.label).join(", ");
    const text = `Application participation: ${label}.`;
    return [{
      text,
      kind: "fact" as const,
      citationIds,
      display: `${text} ${citationIds.map(id => `(${id})`).join(" ")}`,
    }];
  });
  const sourceEvidenceClaims = (response.sourceEvidence ?? []).flatMap((assertion) => {
    const citationIds = [...new Set(
      assertion.sourceIds
        .map((sourceId) => sourceCitationIds.get(sourceId))
        .filter((citationId): citationId is string => Boolean(citationId)),
    )];
    if (citationIds.length === 0) return [];
    return [{
      text: assertion.explanation,
      kind: "fact" as const,
      citationIds,
      display: `${assertion.explanation} ${citationIds.map(id => `(${id})`).join(" ")}`,
    }];
  });
  const impacts = response.impacts.map((impact) => {
    const citationIds = [...new Set(
      impact.sourceIds
        .map((sourceId) => sourceCitationIds.get(sourceId))
        .filter((citationId): citationId is string => Boolean(citationId)),
    )];
    const markers = citationIds.map((citationId) =>
      citations.some((citation) => citation.citationId === citationId)
        ? `(${citationId})`
        : "",
    ).filter(Boolean);
    return {
      text: impact.explanation,
      citationIds,
      kind: citationIds.length ? "fact" as const : "hypothesis" as const,
      display: `${impact.explanation}${markers.length ? ` ${markers.join(" ")}` : ""}`,
    };
  });
  const disposition = copilotDisposition(response.disposition);
  const issues = response.issues.map((issue) => issue.message).filter(Boolean);
  const summary = response.summary?.trim();
  const answer = [
    summary,
    ...impacts.map((impact) => impact.display),
    ...factClaims.map((claim) => claim.display),
    ...applicationContextClaims.map((claim) => claim.display),
    ...sourceEvidenceClaims.map((claim) => claim.display),
    ...(disposition === "Answer" ? issues : []),
  ].filter((part): part is string => Boolean(part)).join("\n\n") ||
    (disposition === "Clarify"
      ? issues.join("\n\n") || "Which engineering item should I assess?"
      : disposition === "Abstain"
        ? issues.join("\n\n") || "The available evidence does not support a reliable impact answer."
        : "Engineering impact answers are temporarily unavailable.");

  return {
    answer,
    claims: [
      ...impacts.map(({ text, kind, citationIds }) => ({ text, kind, citationIds })),
      ...factClaims.map(({ text, kind, citationIds }) => ({ text, kind, citationIds })),
      ...applicationContextClaims.map(({ text, kind, citationIds }) => ({ text, kind, citationIds })),
      ...sourceEvidenceClaims.map(({ text, kind, citationIds }) => ({ text, kind, citationIds })),
    ],
    recommendations: [],
    uncertainties: issues,
    followUpQuestions: disposition === "Clarify" ? issues : [],
    snapshotRevision,
    citations,
    runtime: {
      disposition,
      ...(response.contextPackageId ? { contextPackageId: response.contextPackageId } : {}),
      ...(response.semanticSupportStatus ? { semanticSupportStatus: response.semanticSupportStatus } : {}),
      ...(response.issues.length
        ? {
            issues: response.issues.map((issue) => ({
              code: issue.code,
              ...(issue.claimId !== undefined ? { claimId: issue.claimId } : {}),
            })),
          }
        : {}),
    },
  };
}

export function mapEngineeringImpactRuntimeCall(
  result: EngineeringImpactRuntimeCallResult,
  snapshotRevision: number,
): CopilotAnswer {
  if (result.status === "response") return mapRuntimeResponse(result.response, snapshotRevision);

  const disposition: CopilotRuntimeDisposition = result.status === "denied"
    ? "Deny"
    : result.status === "unavailable"
      ? "Unavailable"
      : "Failed";
  const answer = result.status === "denied"
    ? "You are not authorized to access this investigation."
    : result.status === "unavailable"
      ? "Engineering impact answers are temporarily unavailable while the runtime connection is being configured."
      : result.code === "runtime-credential-rejected"
        ? "The engineering impact runtime rejected its configured credential."
        : "The engineering impact runtime could not complete this answer.";
  const diagnosticCode = "code" in result ? result.code : "authorization-denied";
  return {
    answer,
    claims: [],
    recommendations: [],
    uncertainties: disposition === "Deny" ? [] : [answer],
    followUpQuestions: [],
    snapshotRevision,
    citations: [],
    runtime: {
      disposition,
      diagnosticCode,
    },
  };
}

export function readEngineeringImpactRuntimeRoutingConfiguration(
  readiness: { endpointConfigured: boolean; credentialProviderConfigured: boolean } = {
    endpointConfigured: false,
    credentialProviderConfigured: false,
  },
): EngineeringImpactRuntimeRoutingConfiguration {
  return {
    enabled: process.env.LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED?.trim().toLowerCase() === "true",
    runtimeEndpointAvailable: readiness.endpointConfigured,
    runtimeCredentialProviderAvailable: readiness.credentialProviderConfigured,
  };
}

export function routeEngineeringImpactAnswer(
  input: EngineeringImpactRuntimeRoutingInput,
  configuration: EngineeringImpactRuntimeRoutingConfiguration,
): EngineeringImpactRuntimeRoute {
  if (!configuration.enabled ||
      !input.question.trim() ||
      !input.investigationId?.trim()) {
    return { route: "legacy" };
  }

  if (!configuration.runtimeEndpointAvailable || !configuration.runtimeCredentialProviderAvailable) {
    return {
      route: "blocked",
      failureCode: "ai-runtime-rollout-blocked",
      message: "Engineering impact answers are temporarily unavailable while the runtime connection is being configured.",
    };
  }

  return { route: "runtime" };
}
