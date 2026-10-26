import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordCopilotUsage } from "../usage-ledger";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "copilot-usage-ledger-"));
  roots.push(root);
  return root;
}

beforeEach(() => vi.unstubAllEnvs());
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("copilot usage CSV ledger", () => {
  it("appends Excel-readable rows with token counts and estimated USD cost", async () => {
    const root = await temporaryRoot();
    vi.stubEnv("LATTICE_COPILOT_USAGE_LOG_PATH", path.join(root, "usage.csv"));
    await Promise.all([
      recordCopilotUsage({
        timestamp: "2026-10-23T10:00:00.000Z",
        requestId: "request-1",
        deployment: "gpt-4o-mini",
        apiVersion: "2025-01-01-preview",
        attempt: 1,
        httpStatus: 200,
        outcome: "success",
        latencyMs: 43.4,
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        inputCostPerMillionTokensUsd: 0.15,
        outputCostPerMillionTokensUsd: 0.60,
      }),
      recordCopilotUsage({
        timestamp: "2026-10-23T10:01:00.000Z",
        requestId: "request-2",
        deployment: "gpt-4o-mini",
        apiVersion: "2025-01-01-preview",
        attempt: 1,
        httpStatus: 429,
        outcome: "provider-http-error",
        latencyMs: 21,
      }),
    ]);

    const content = await readFile(path.join(root, "usage.csv"), "utf8");
    const lines = content.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("timestamp_utc,request_id,deployment,api_version,attempt,http_status,outcome,latency_ms,prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd");
    expect(lines[1]).toContain("2026-10-23T10:00:00.000Z,request-1,gpt-4o-mini,2025-01-01-preview,1,200,success,43,1000,500,1500,0.00045");
    expect(lines[2]).toContain("request-2,gpt-4o-mini,2025-01-01-preview,1,429,provider-http-error,21,,,,");
  });

  it("does not log prompts, completions, credentials, or invalid token counts", async () => {
    const root = await temporaryRoot();
    vi.stubEnv("LATTICE_COPILOT_USAGE_LOG_PATH", path.join(root, "usage.csv"));
    await recordCopilotUsage({
      timestamp: "2026-10-23T10:00:00.000Z",
      requestId: "request-safe",
      deployment: "gpt-4o-mini",
      apiVersion: "2025-01-01-preview",
      attempt: 1,
      httpStatus: 200,
      outcome: "success",
      latencyMs: 10,
      promptTokens: -4,
      completionTokens: Number.NaN,
      totalTokens: 25,
      inputCostPerMillionTokensUsd: 0.15,
      outputCostPerMillionTokensUsd: 0.60,
    });

    const content = await readFile(path.join(root, "usage.csv"), "utf8");
    expect(content).not.toContain("private prompt");
    expect(content).not.toContain("private completion");
    expect(content).not.toContain("api-key");
    expect(content).toContain(",success,10,,,25,");
    expect(content.endsWith("\r\n")).toBe(true);
  });

  it("uses the default local data path and emits no cost when rates are absent", async () => {
    const root = await temporaryRoot();
    vi.stubEnv("LATTICE_COPILOT_USAGE_LOG_PATH", path.join(root, "nested", "default.csv"));
    await recordCopilotUsage({
      timestamp: "2026-10-23T10:00:00.000Z",
      requestId: "request-no-rates",
      deployment: "gpt-4o-mini",
      apiVersion: "2025-01-01-preview",
      attempt: 1,
      httpStatus: 200,
      outcome: "success",
      latencyMs: 2,
      promptTokens: 5,
      completionTokens: 5,
      totalTokens: 10,
    });

    const content = await readFile(path.join(root, "nested", "default.csv"), "utf8");
    expect(content).toContain("request-no-rates,gpt-4o-mini,2025-01-01-preview,1,200,success,2,5,5,10,");
  });
});