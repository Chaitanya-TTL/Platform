import type {
  FactAdapterDiagnosticV1,
  FactRequestScopeV1,
  FactRetrievalOutcomeV1,
  GenericFactV1,
  SourceCoverageStatementV1,
} from "../../contracts/factual-evidence-v1";

export type FactualServingDecisionV1 =
  | { status: "supported"; facts: readonly GenericFactV1[]; answerable: true }
  | {
      status: "present-but-citation-ineligible";
      facts: readonly GenericFactV1[];
      diagnostics: readonly FactAdapterDiagnosticV1[];
      scope: FactRequestScopeV1;
      answerable: false;
    }
  | {
      status: "absent";
      scope: FactRequestScopeV1;
      reasonCode: string;
      coverage?: readonly SourceCoverageStatementV1[];
      answerable: false;
    }
  | { status: "ambiguous"; facts: readonly GenericFactV1[]; reasonCode: string; answerable: false }
  | { status: "conflicting"; facts: readonly GenericFactV1[]; reasonCode: string; answerable: false }
  | { status: "stale"; facts: readonly GenericFactV1[]; reasonCode: string; answerable: false }
  | {
      status: "projection-omitted";
      factIds: readonly string[];
      scope: FactRequestScopeV1;
      firstLossStage: string;
      reasonCode: string;
      answerable: false;
    }
  | {
      status: "unsupported";
      scope: FactRequestScopeV1;
      diagnostics: readonly FactAdapterDiagnosticV1[];
      facts?: readonly GenericFactV1[];
      answerable: false;
    };

const missingCitation = (diagnostics: readonly FactAdapterDiagnosticV1[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.code === "missing-citation");

export function decideFactualServing(
  outcome: FactRetrievalOutcomeV1,
): FactualServingDecisionV1 {
  switch (outcome.status) {
    case "fact-found":
      return { status: "supported", facts: [outcome.fact], answerable: true };
    case "safe-aggregate":
      return { status: "supported", facts: [outcome.fact], answerable: true };
    case "multiple-compatible-facts":
      return {
        status: "ambiguous",
        facts: outcome.facts,
        reasonCode: outcome.reasonCode ?? "multiple-compatible-facts",
        answerable: false,
      };
    case "ambiguous-entity":
    case "ambiguous-field":
      return { status: "ambiguous", facts: outcome.candidates, reasonCode: outcome.reasonCode, answerable: false };
    case "incompatible-facts":
    case "fact-conflicting":
      return { status: "conflicting", facts: outcome.facts, reasonCode: outcome.reasonCode, answerable: false };
    case "fact-stale":
      return { status: "stale", facts: outcome.facts, reasonCode: outcome.reasonCode, answerable: false };
    case "fact-unavailable":
      return { status: "absent", scope: outcome.scope, reasonCode: outcome.reasonCode, coverage: outcome.coverage, answerable: false };
    case "fact-omitted-during-projection":
      return {
        status: "projection-omitted",
        factIds: outcome.factIds,
        scope: outcome.scope,
        firstLossStage: outcome.firstLossStage,
        reasonCode: outcome.reasonCode,
        answerable: false,
      };
    case "unsupported-fact-representation":
      return outcome.facts?.length && missingCitation(outcome.diagnostics)
        ? {
            status: "present-but-citation-ineligible",
            facts: outcome.facts,
            diagnostics: outcome.diagnostics,
            scope: outcome.scope,
            answerable: false,
          }
        : {
            status: "unsupported",
            scope: outcome.scope,
            diagnostics: outcome.diagnostics,
            facts: outcome.facts,
            answerable: false,
          };
  }
}
