import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCopilotTraceContext,
  writeCopilotTrace,
  type CopilotExecutionTraceEvent,
} from "../copilot-execution-trace";

const event: CopilotExecutionTraceEvent = {
  schemaVersion: "1",
  event: "stage.completed",
  stage: "prompt",
  routeSource: "UnifiedRuntime",
  payloadDetail: "summary",
  timestampUtc: "2026-11-26T12:00:00.000Z",
  requestId: "request-1",
  traceId: "trace-1",
  investigationId: "investigation-1",
  snapshotRevision: 4,
  durationMs: 12,
  outcome: "completed",
  input: { question: "Summarize this", authorization: "Bearer unit-test-secret" },
  output: { status: "completed" },
  transformations: [],
  itemsAdded: [],
  itemsRemoved: [],
  rejectionReasons: [],
  payloadRef: "payload-1",
  fullPayload: { snapshot: "full investigation payload", apiKey: "unit-test-secret" },
  diagnostics: {},
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Copilot execution trace writer", () => {
  it("writes compact JSON events without full payloads by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE", "false");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    writeCopilotTrace(event);

    const output = String(info.mock.calls[0]?.[0]);
    expect(info).toHaveBeenCalledOnce();
    expect(output).toContain('"routeSource":"UnifiedRuntime"');
    expect(output).toContain('"requestId":"request-1"');
    expect(output).not.toContain("full investigation payload");
    expect(output).not.toContain("unit-test-secret");
    expect(output.toLowerCase()).not.toContain("apikey");
    expect(output.toLowerCase()).not.toContain("authorization");
  });

  it("includes the targeted full payload in non-production and removes credential fields", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    writeCopilotTrace({ ...event, payloadDetail: "full" });

    const output = String(info.mock.calls[0]?.[0]);
    expect(output).toContain("full investigation payload");
    expect(output).not.toContain("unit-test-secret");
    expect(output.toLowerCase()).not.toContain("apikey");
    expect(output.toLowerCase()).not.toContain("authorization");
  });

  it("does not emit full payloads in production even if the setting is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    writeCopilotTrace({ ...event, payloadDetail: "full" });

    const output = String(info.mock.calls[0]?.[0]);
    expect(output).not.toContain("full investigation payload");
    expect(error).toHaveBeenCalled();
  });

  it("creates a request id and valid W3C root trace context", () => {
    const context = createCopilotTraceContext();

    expect(context.requestId).toBeTruthy();
    expect(context.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(context).toMatchObject({ routeSource: "Unknown", payloadDetail: "summary" });
  });
});
