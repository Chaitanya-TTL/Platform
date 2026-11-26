import type { GenericFactV1 } from "../../contracts/factual-evidence-v1";
import type { FactualServingOrchestrationResultV1 } from "./factual-serving-orchestrator";

export type FactualResponseCompositionV1 =
  | {
      status: "ready-to-serve";
      answer: string;
      fieldId: string;
      fieldLabel: string;
      sourceApplication: string;
      sourceEntityId: string;
      exactValue: unknown;
      citationIds: readonly string[];
    }
  | { status: "cannot-serve-citation-ineligible"; message: string }
  | { status: "fact-absent"; message: string }
  | { status: "needs-clarification"; message: string; reasonCode: string }
  | { status: "fact-conflicting"; message: string }
  | { status: "fact-stale"; message: string }
  | { status: "projection-omitted"; message: string }
  | { status: "unsupported"; message: string };

const formatValue = (fact: GenericFactV1): string => {
  const value = fact.exactSourceValue;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return JSON.stringify(value);
};

const conciseFactAnswer = (fact: GenericFactV1): string =>
  `${fact.fieldLabel}: ${formatValue(fact)}.`;

export function composeFactualResponse(
  result: FactualServingOrchestrationResultV1,
): FactualResponseCompositionV1 {
  if (result.status !== "direct-fact-request") {
    if (result.status === "ambiguous-direct-fact-request") {
      return { status: "needs-clarification", message: "The factual request needs a more specific application, entity, or field.", reasonCode: result.reasonCode };
    }
    return { status: "unsupported", message: "This request is not eligible for deterministic factual serving." };
  }

  const decision = result.decision;
  switch (decision.status) {
    case "supported": {
      if (decision.facts.length !== 1) {
        return { status: "needs-clarification", message: "More than one compatible fact matched the request.", reasonCode: "multiple-supported-facts" };
      }
      const fact = decision.facts[0];
      if (!fact.citationEligible || !fact.citationIds.length) {
        return { status: "cannot-serve-citation-ineligible", message: "The fact exists, but it does not have eligible serving evidence." };
      }
      return {
        status: "ready-to-serve",
        answer: conciseFactAnswer(fact),
        fieldId: fact.fieldId,
        fieldLabel: fact.fieldLabel,
        sourceApplication: fact.sourceApplication,
        sourceEntityId: fact.sourceEntityId,
        exactValue: fact.exactSourceValue,
        citationIds: fact.citationIds,
      };
    }
    case "present-but-citation-ineligible":
      return { status: "cannot-serve-citation-ineligible", message: "The fact exists, but it does not have eligible serving evidence." };
    case "absent":
      return { status: "fact-absent", message: "The requested fact is not available in the selected application and scope." };
    case "ambiguous":
      return { status: "needs-clarification", message: "More than one entity or field matches the factual request.", reasonCode: decision.reasonCode };
    case "conflicting":
      return { status: "fact-conflicting", message: "Conflicting source-backed values were found for the requested fact." };
    case "stale":
      return { status: "fact-stale", message: "Only stale values are available for the requested fact." };
    case "projection-omitted":
      return { status: "projection-omitted", message: "The fact existed in source data but was omitted before serving." };
    case "unsupported":
      return { status: "unsupported", message: "The requested fact cannot be served from the available representation." };
  }
}
