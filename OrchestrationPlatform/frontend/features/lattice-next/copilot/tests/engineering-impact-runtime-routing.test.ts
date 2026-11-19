import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  readEngineeringImpactRuntimeRoutingConfiguration,
  routeEngineeringImpactAnswer,
  type EngineeringImpactRuntimeRoutingConfiguration,
} from "../engineering-impact-runtime-routing";

const readyConfiguration: EngineeringImpactRuntimeRoutingConfiguration = {
  enabled: true,
  authorizationProviderAvailable: true,
  userIdentityPropagationAvailable: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("engineering impact runtime routing", () => {
  it("defaults the server-side feature flag to disabled", () => {
    vi.stubEnv("LATTICE_AI_RUNTIME_ENGINEERING_IMPACT_ANSWERS_ENABLED", "");

    expect(readEngineeringImpactRuntimeRoutingConfiguration()).toMatchObject({
      enabled: false,
      authorizationProviderAvailable: false,
      userIdentityPropagationAvailable: false,
    });
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
    "What is impacted?",
    "What is impacted if R-123 or R-456 changes?",
  ])("keeps unsupported or non-explicit question on the existing path: %s", (question) => {
    expect(routeEngineeringImpactAnswer(
      { question, investigationId: "INV-123" },
      readyConfiguration,
    )).toEqual({ route: "legacy" });
  });

  it("does not route without an active investigation", () => {
    expect(routeEngineeringImpactAnswer(
      { question: "What is impacted if R-123 changes?", investigationId: null },
      readyConfiguration,
    )).toEqual({ route: "legacy" });
  });

  it("blocks enabled routing when authorization or identity propagation is unavailable", () => {
    expect(routeEngineeringImpactAnswer(
      { question: "What is impacted if R-123 changes?", investigationId: "INV-123" },
      { ...readyConfiguration, authorizationProviderAvailable: false },
    )).toEqual({
      route: "blocked",
      failureCode: "ai-runtime-rollout-blocked",
      message: "Engineering impact answers are temporarily unavailable while authorization is being configured.",
    });

    expect(routeEngineeringImpactAnswer(
      { question: "What is impacted if R-123 changes?", investigationId: "INV-123" },
      { ...readyConfiguration, userIdentityPropagationAvailable: false },
    )).toMatchObject({ route: "blocked", failureCode: "ai-runtime-rollout-blocked" });
  });

  it("selects the runtime only when the explicit intent and server readiness gates pass", () => {
    expect(routeEngineeringImpactAnswer(
      { question: "Show the downstream engineering impact of R-123.", investigationId: "INV-123" },
      readyConfiguration,
    )).toEqual({ route: "runtime" });
  });
});
