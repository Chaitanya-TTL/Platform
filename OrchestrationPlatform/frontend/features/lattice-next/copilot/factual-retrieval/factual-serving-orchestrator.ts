import type { EngineeringIntelligenceInvestigationV1 } from "../../contracts/intelligence-v1";
import type { FactRetrievalOutcomeV1 } from "../../contracts/factual-evidence-v1";
import { codebeamerRequirementFactAdapter } from "./codebeamer-requirement-adapter";
import { configitFactSourceAdapterV1 } from "./configit-fact-adapter";
import {
  routeDirectFactualRequest,
  type DirectFactualRequestInputV1,
  type DirectFactualRequestRoutingV1,
} from "./direct-factual-request-router";
import { decideFactualServing, type FactualServingDecisionV1 } from "./factual-serving-decision";
import type { GenericFactAdapterResultV1, GenericFactSourceAdapterV1 } from "./source-fact-adapter";
import { discoverStructuredFacts } from "./structured-fact-discovery";
import { windchillPartFactAdapter } from "./windchill-part-fact-adapter";

export type FactualServingOrchestrationInputV1 = DirectFactualRequestInputV1 & {
  investigation: EngineeringIntelligenceInvestigationV1;
};

export type FactualServingOrchestrationResultV1 =
  | Exclude<DirectFactualRequestRoutingV1, { status: "direct-fact-request" }>
  | {
      status: "direct-fact-request";
      routing: Extract<DirectFactualRequestRoutingV1, { status: "direct-fact-request" }>;
      discovery: FactRetrievalOutcomeV1;
      decision: FactualServingDecisionV1;
    };

type SupportedApplication = "codebeamer" | "windchill" | "configit";

type FactualServingOrchestrationDependenciesV1 = {
  adapters: Readonly<Record<SupportedApplication, GenericFactSourceAdapterV1>>;
  discover: typeof discoverStructuredFacts;
  decide: typeof decideFactualServing;
};

const defaultDependencies: FactualServingOrchestrationDependenciesV1 = {
  adapters: {
    codebeamer: codebeamerRequirementFactAdapter,
    windchill: windchillPartFactAdapter,
    configit: configitFactSourceAdapterV1,
  },
  discover: discoverStructuredFacts,
  decide: decideFactualServing,
};

export function orchestrateFactualServing(
  input: FactualServingOrchestrationInputV1,
  dependencies: FactualServingOrchestrationDependenciesV1 = defaultDependencies,
): FactualServingOrchestrationResultV1 {
  const routing = routeDirectFactualRequest(input);
  if (routing.status !== "direct-fact-request") return routing;

  const sourceApplication = routing.constraints.sourceApplication as SupportedApplication;
  const adapter = dependencies.adapters[sourceApplication];
  const projected: GenericFactAdapterResultV1 = adapter.map({ investigation: input.investigation });
  const discovery = dependencies.discover(
    projected.facts,
    routing.constraints,
    [routing.registration],
    { sourceCoverage: projected.sourceCoverage },
  );

  return {
    status: "direct-fact-request",
    routing,
    discovery,
    decision: dependencies.decide(discovery),
  };
}
