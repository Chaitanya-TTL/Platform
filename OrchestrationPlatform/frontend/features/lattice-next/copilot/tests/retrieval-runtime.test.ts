import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDocumentRetrievalRuntime } from "../retrieval/retrieval-runtime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("document retrieval runtime", () => {
  it("remains unavailable regardless of retrieval-related environment values", () => {
    vi.stubEnv("LATTICE_COPILOT_RETRIEVAL_ENABLED", "true");
    vi.stubEnv("LATTICE_RETRIEVAL_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_RETRIEVAL_PROVIDER", "fixture");

    expect(getDocumentRetrievalRuntime()).toBeUndefined();
  });
});
