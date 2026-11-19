import "server-only";

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
