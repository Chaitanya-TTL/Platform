import "server-only";

import { randomUUID } from "node:crypto";
import { getCopilotConfig, type CopilotConfig } from "./config";
import { recordCopilotUsage, type CopilotUsageRecord } from "./usage-ledger";

export type AzureChatRole = "system" | "user" | "assistant";

export interface AzureChatMessage {
  role: AzureChatRole;
  content: string;
}

export interface AzureChatRequest {
  messages: readonly AzureChatMessage[];
  requestId?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface AzureChatResponse {
  content: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export type AzureOpenAIErrorCode =
  | "invalid-configuration"
  | "timeout"
  | "network-error"
  | "provider-http-error"
  | "invalid-provider-response"
  | "usage-ledger-error";

export class AzureOpenAIError extends Error {
  constructor(
    readonly code: AzureOpenAIErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AzureOpenAIError";
  }
}

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 30_000;

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new AzureOpenAIError("invalid-configuration", "Azure OpenAI transport is available only on the server.");
  }
}

function requestUrl(config: CopilotConfig): string {
  return `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
}

function transientStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function usageValue(value: unknown): AzureChatResponse["usage"] {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  return {
    ...(typeof usage.prompt_tokens === "number" ? { promptTokens: usage.prompt_tokens } : {}),
    ...(typeof usage.completion_tokens === "number" ? { completionTokens: usage.completion_tokens } : {}),
    ...(typeof usage.total_tokens === "number" ? { totalTokens: usage.total_tokens } : {}),
  };
}

function providerUsage(value: unknown): AzureChatResponse["usage"] {
  if (!value || typeof value !== "object") return undefined;
  return usageValue((value as Record<string, unknown>).usage);
}

function parseResponse(value: unknown): AzureChatResponse {
  if (!value || typeof value !== "object") throw new AzureOpenAIError("invalid-provider-response", "Azure OpenAI returned an invalid response.");
  const body = value as Record<string, unknown>;
  const choices = body.choices;
  if (!Array.isArray(choices) || !choices.length || !choices[0] || typeof choices[0] !== "object")
    throw new AzureOpenAIError("invalid-provider-response", "Azure OpenAI returned an invalid response.");
  const choice = choices[0] as Record<string, unknown>;
  const message = choice.message;
  if (!message || typeof message !== "object" || typeof (message as Record<string, unknown>).content !== "string")
    throw new AzureOpenAIError("invalid-provider-response", "Azure OpenAI returned an invalid response.");
  return {
    content: (message as Record<string, string>).content,
    ...(typeof choice.finish_reason === "string" ? { finishReason: choice.finish_reason } : {}),
    ...(usageValue(body.usage) ? { usage: usageValue(body.usage) } : {}),
  };
}

function validateRequest(request: AzureChatRequest): void {
  if (!Array.isArray(request.messages) || request.messages.length === 0 ||
      request.messages.some((message) => !message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string")) {
    throw new AzureOpenAIError("invalid-configuration", "Azure chat request must contain valid messages.");
  }
  if (request.requestId !== undefined && !/^[a-zA-Z0-9._:-]{1,128}$/.test(request.requestId))
    throw new AzureOpenAIError("invalid-configuration", "Azure chat requestId must be a short safe identifier.");
  if (request.maxTokens !== undefined && (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > 16_384))
    throw new AzureOpenAIError("invalid-configuration", "Azure chat maxTokens is outside the allowed range.");
  if (request.temperature !== undefined && (!Number.isFinite(request.temperature) || request.temperature < 0 || request.temperature > 2))
    throw new AzureOpenAIError("invalid-configuration", "Azure chat temperature is outside the allowed range.");
}

export async function completeCopilotTurn(request: AzureChatRequest): Promise<AzureChatResponse> {
  assertServerRuntime();
  validateRequest(request);
  const result = getCopilotConfig();
  if (!result.ok) {
    const message = result.errors.some((error) => error.startsWith("Azure model calls are disabled."))
      ? "Azure OpenAI live calls are disabled."
      : "Azure OpenAI server configuration is incomplete or invalid.";
    throw new AzureOpenAIError("invalid-configuration", message);
  }

  const config = result.config;
  const requestId = request.requestId ?? randomUUID();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    const attemptStartedAt = Date.now();
    try {
      response = await fetch(requestUrl(config), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": config.apiKey,
        },
        body: JSON.stringify({
          messages: request.messages,
          ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        }),
        signal: request.signal
          ? AbortSignal.any([request.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (cause) {
      const timedOut = cause instanceof DOMException && (cause.name === "AbortError" || cause.name === "TimeoutError");
      await logUsage({
        timestamp: new Date().toISOString(),
        requestId,
        deployment: config.deployment,
        apiVersion: config.apiVersion,
        attempt,
        httpStatus: timedOut ? "timeout" : "network-error",
        outcome: timedOut ? "timeout" : "network-error",
        latencyMs: Date.now() - attemptStartedAt,
        inputCostPerMillionTokensUsd: config.inputCostPerMillionTokensUsd,
        outputCostPerMillionTokensUsd: config.outputCostPerMillionTokensUsd,
      });
      if (timedOut)
        throw new AzureOpenAIError("timeout", "Azure OpenAI request timed out.");
      throw new AzureOpenAIError("network-error", "Azure OpenAI network request failed; the provider may have received it. Do not retry automatically.");
    }

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      value = undefined;
    }
    const usage = providerUsage(value);
    let parsedResponse: AzureChatResponse | undefined;
    let outcome: CopilotUsageRecord["outcome"];
    if (!response.ok) {
      outcome = "provider-http-error";
    } else {
      try {
        parsedResponse = parseResponse(value);
        outcome = "success";
      } catch {
        outcome = "invalid-provider-response";
      }
    }

    await logUsage({
      timestamp: new Date().toISOString(),
      requestId,
      deployment: config.deployment,
      apiVersion: config.apiVersion,
      attempt,
      httpStatus: response.status,
      outcome,
      latencyMs: Date.now() - attemptStartedAt,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      totalTokens: usage?.totalTokens,
      inputCostPerMillionTokensUsd: config.inputCostPerMillionTokensUsd,
      outputCostPerMillionTokensUsd: config.outputCostPerMillionTokensUsd,
    });

    if (!response.ok) {
      if (transientStatus(response.status) && attempt < MAX_ATTEMPTS) {
        await delay(100 * attempt);
        continue;
      }
      throw new AzureOpenAIError("provider-http-error", `Azure OpenAI request failed with status ${response.status}.`, response.status);
    }
    if (!parsedResponse) {
      throw new AzureOpenAIError("invalid-provider-response", value === undefined
        ? "Azure OpenAI returned malformed JSON."
        : "Azure OpenAI returned an invalid response.");
    }
    return parsedResponse;
  }

  throw new AzureOpenAIError("network-error", "Azure OpenAI request exhausted its bounded transient-response retries.");
}

async function logUsage(record: CopilotUsageRecord): Promise<void> {
  try {
    await recordCopilotUsage(record);
  } catch {
    throw new AzureOpenAIError(
      "usage-ledger-error",
      "The model request completed but usage could not be recorded. Do not automatically retry this request.",
    );
  }
}