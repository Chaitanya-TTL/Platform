import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordCopilotUsage } = vi.hoisted(() => ({ recordCopilotUsage: vi.fn().mockResolvedValue(undefined) }));

vi.mock("server-only", () => ({}));
vi.mock("../usage-ledger", () => ({ recordCopilotUsage }));

import { getCopilotConfig } from "../config";
import { AzureOpenAIError, completeCopilotTurn } from "../azure-openai-client";
import { createCopilotTraceContext } from "../copilot-execution-trace";

const configValues = {
  AZURE_OPENAI_LIVE_CALLS_ENABLED: "true",
  AZURE_OPENAI_ENDPOINT: "https://plmaihub013675441957.openai.azure.com/",
  AZURE_OPENAI_API_KEY: "unit-test-secret-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini",
  AZURE_OPENAI_API_VERSION: "2025-01-01-preview",
};

const successResponse = (content = "Grounded response") => new Response(JSON.stringify({
  choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
}), { status: 200, headers: { "content-type": "application/json" } });

function configure(values: Partial<typeof configValues> = configValues) {
  for (const [key, value] of Object.entries({ ...configValues, ...values })) vi.stubEnv(key, value ?? "");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  recordCopilotUsage.mockReset().mockResolvedValue(undefined);
  configure();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("copilot Azure configuration", () => {
  it("requires all server settings and never returns the key in validation errors", () => {
    configure({ AZURE_OPENAI_API_KEY: "unit-test-secret-key", AZURE_OPENAI_API_VERSION: "" });
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "");

    const result = getCopilotConfig();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.errors)).not.toContain("unit-test-secret-key");
  });

  it("blocks Azure requests unless the paid-call opt-in is explicitly true", async () => {
    vi.stubEnv("AZURE_OPENAI_LIVE_CALLS_ENABLED", "false");

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "invalid-configuration", message: expect.stringMatching(/disabled/i) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates HTTPS endpoint and normalizes trailing slashes", () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://plmaihub013675441957.openai.azure.com///");
    expect(getCopilotConfig()).toMatchObject({
      ok: true,
      config: {
        endpoint: "https://plmaihub013675441957.openai.azure.com",
        deployment: "gpt-4o-mini",
        apiVersion: "2025-01-01-preview",
      },
    });

    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "http://example.com");
    expect(getCopilotConfig()).toMatchObject({ ok: false });
  });

  it("accepts optional non-negative token rates and rejects malformed rates", () => {
    vi.stubEnv("AZURE_OPENAI_INPUT_COST_PER_1M_USD", "0.15");
    vi.stubEnv("AZURE_OPENAI_OUTPUT_COST_PER_1M_USD", "0.60");
    expect(getCopilotConfig()).toMatchObject({
      ok: true,
      config: { inputCostPerMillionTokensUsd: 0.15, outputCostPerMillionTokensUsd: 0.6 },
    });

    vi.stubEnv("AZURE_OPENAI_INPUT_COST_PER_1M_USD", "not-a-rate");
    expect(getCopilotConfig()).toMatchObject({ ok: false });
  });
});

describe("Azure OpenAI transport", () => {
  it("sends the deployment request with Azure key header and configured API version", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(successResponse());

    const response = await completeCopilotTurn({
      messages: [
        { role: "system", content: "System policy" },
        { role: "user", content: "Question" },
      ],
      maxTokens: 1200,
      temperature: 0.1,
    });

    expect(response.content).toBe("Grounded response");
    expect(recordCopilotUsage).toHaveBeenCalledWith(expect.objectContaining({
      requestId: expect.any(String),
      deployment: "gpt-4o-mini",
      apiVersion: "2025-01-01-preview",
      attempt: 1,
      httpStatus: 200,
      outcome: "success",
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    }));
    expect(recordCopilotUsage.mock.calls[0][0]).not.toHaveProperty("messages");
    expect(recordCopilotUsage.mock.calls[0][0]).not.toHaveProperty("content");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe("https://plmaihub013675441957.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview");
    expect(new Headers(init?.headers).get("api-key")).toBe("unit-test-secret-key");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messages: [{ role: "system", content: "System policy" }, { role: "user", content: "Question" }],
      max_tokens: 1200,
      temperature: 0.1,
    });
  });

  it("redacts non-success provider responses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("unit-test-secret-key", { status: 401 }));

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "provider-http-error", status: 401 });
    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.not.toThrow("unit-test-secret-key");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries transient provider errors within the configured bound", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(successResponse("Recovered"));

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .resolves.toMatchObject({ content: "Recovered" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(recordCopilotUsage.mock.calls.map(([record]) => [record.attempt, record.outcome])).toEqual([
      [1, "provider-http-error"],
      [2, "provider-http-error"],
      [3, "success"],
    ]);
  });

  it("traces each observed provider attempt, retry decision, response usage, and targeted prompt/output payload", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_ENABLED", "true");
    vi.stubEnv("LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE", "true");
    const traceContext = createCopilotTraceContext(new Request("https://local.test/copilot", {
      headers: { "x-copilot-diagnostic-detail": "full" },
    }));
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(successResponse("Recovered"));

    await completeCopilotTurn({
      requestId: "trace-attempt-request",
      traceContext,
      investigationId: "trace-investigation",
      snapshotRevision: 7,
      messages: [{ role: "user", content: "Question with evidence" }],
    });

    const events = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
    const attemptEvents = events.filter((event) => String(event.event).startsWith("model.attempt."));
    expect(attemptEvents.map((event) => [event.event, event.outcome])).toEqual([
      ["model.attempt.started", "started"],
      ["model.attempt.completed", "provider-http-error"],
      ["model.attempt.started", "started"],
      ["model.attempt.completed", "success"],
    ]);
    expect(events.filter((event) => event.event === "model.retry.scheduled")).toHaveLength(1);
    expect(attemptEvents[1]).toMatchObject({
      investigationId: "trace-investigation",
      snapshotRevision: 7,
      output: { httpStatus: 503, retryScheduled: true },
    });
    expect(attemptEvents[3]).toMatchObject({
      output: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      fullPayload: { response: { content: "Recovered" } },
    });
    expect(attemptEvents[0]).toMatchObject({
      fullPayload: { messages: [{ role: "user", content: "Question with evidence" }] },
    });
    expect(JSON.stringify(events)).not.toContain("unit-test-secret-key");
  });

  it("stops after the configured number of transient attempts", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(new Response("busy", { status: 503 }));

    const request = completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] });
    const rejection = expect(request)
      .rejects.toMatchObject({ code: "provider-http-error", status: 503 });
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetch).toHaveBeenCalledTimes(300);
    expect(recordCopilotUsage).toHaveBeenCalledTimes(300);
  });

  it("does not retry permanent provider errors", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toBeInstanceOf(AzureOpenAIError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports timeout without leaking credentials", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("aborted", "AbortError"));

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "timeout" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not automatically retry ambiguous network failures that may have reached Azure", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("connection reset by proxy"));

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "network-error", message: expect.stringMatching(/do not retry automatically/i) });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(recordCopilotUsage).toHaveBeenCalledTimes(1);
    expect(recordCopilotUsage).toHaveBeenCalledWith(expect.objectContaining({ httpStatus: "network-error", outcome: "network-error" }));
  });

  it("rejects malformed provider JSON and response shape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "invalid-provider-response" });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "invalid-provider-response" });
  });

  it("rejects invalid configuration before making a network request", async () => {
    vi.stubEnv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview");
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "not a URL");

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "invalid-configuration" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not report a model response as successful when usage persistence fails", async () => {
    vi.mocked(fetch).mockResolvedValue(successResponse());
    recordCopilotUsage.mockRejectedValue(new Error("disk unavailable"));

    await expect(completeCopilotTurn({ messages: [{ role: "user", content: "Question" }] }))
      .rejects.toMatchObject({ code: "usage-ledger-error" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(recordCopilotUsage).toHaveBeenCalledTimes(1);
  });
});