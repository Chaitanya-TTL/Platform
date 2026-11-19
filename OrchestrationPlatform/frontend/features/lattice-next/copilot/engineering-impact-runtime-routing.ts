import "server-only";
import type { CopilotCitation } from "./contracts";

const IMPACT_INTENT = /\b(?:impacts?|impacted|affected|downstream|depends?|dependents?|engineering\s+items)\b/i;
const CONDITIONAL_CHANGE_INTENT = /\bwhat\s+happens\s+if\b.*\bchanges?\b/i;
const EXPLICIT_SUBJECT_ID = /(?<![A-Z0-9_-])(?:REQ|R)-\d+(?![A-Z0-9_-])/gi;

export interface EngineeringImpactRuntimeRoutingInput {
  question: string;
  investigationId?: string | null;
}

export interface EngineeringImpactRuntimeRoutingConfiguration {
  enabled: boolean;
  authorizationProviderAvailable: boolean;
  userIdentityPropagationAvailable: boolean;
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
    }
  | {
      disposition: "Clarify" | "Abstain";
      issues: readonly { message: string }[];
    }
  | { disposition: "Deny" | "Failed" };

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

export function readEngineeringImpactRuntimeRoutingConfiguration():
  EngineeringImpactRuntimeRoutingConfiguration {
  return {
    enabled: process.env.LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED?.trim().toLowerCase() === "true",
    authorizationProviderAvailable: false,
    userIdentityPropagationAvailable: false,
  };
}

export function routeEngineeringImpactAnswer(
  input: EngineeringImpactRuntimeRoutingInput,
  configuration: EngineeringImpactRuntimeRoutingConfiguration,
): EngineeringImpactRuntimeRoute {
  const question = input.question.trim();
  const hasImpactIntent = IMPACT_INTENT.test(question) || CONDITIONAL_CHANGE_INTENT.test(question);
  const subjectIds = [...new Set((question.match(EXPLICIT_SUBJECT_ID) ?? []).map((id) => id.toUpperCase()))];
  if (!configuration.enabled ||
      !hasImpactIntent ||
      subjectIds.length !== 1 ||
      !input.investigationId?.trim()) {
    return { route: "legacy" };
  }

  if (!configuration.authorizationProviderAvailable || !configuration.userIdentityPropagationAvailable) {
    return {
      route: "blocked",
      failureCode: "ai-runtime-rollout-blocked",
      message: "Engineering impact answers are temporarily unavailable while authorization is being configured.",
    };
  }

  return { route: "runtime" };
}
