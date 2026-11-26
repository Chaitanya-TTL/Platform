import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runtimeAccessTokenProvider } from "../runtime-access-token-provider";

describe("runtime access token provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("provides the local runtime credential only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(runtimeAccessTokenProvider.isConfigured()).toBe(true);
    await expect(runtimeAccessTokenProvider.getAccessToken()).resolves.toEqual({
      status: "available",
      accessToken: "lattice-local-development",
    });
  });

  it.each(["test", "production"])("remains unavailable in %s", async (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);

    expect(runtimeAccessTokenProvider.isConfigured()).toBe(false);
    await expect(runtimeAccessTokenProvider.getAccessToken()).resolves.toEqual({
      status: "unavailable",
    });
  });
});
