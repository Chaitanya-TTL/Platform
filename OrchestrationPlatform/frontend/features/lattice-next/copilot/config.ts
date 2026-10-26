import "server-only";

export interface CopilotConfig {
  liveCallsEnabled: true;
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  inputCostPerMillionTokensUsd?: number;
  outputCostPerMillionTokensUsd?: number;
}

export type CopilotConfigResult =
  | { ok: true; config: CopilotConfig }
  | { ok: false; errors: readonly string[] };

function assertServerEnvironment(): void {
  if (typeof window !== "undefined") {
    throw new Error("Azure copilot configuration is available only on the server.");
  }
}

function readSetting(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readOptionalRate(name: string, errors: string[]): number | undefined {
  const value = readSetting(name);
  if (value === undefined) return undefined;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) {
    errors.push(`${name} must be a non-negative number when set.`);
    return undefined;
  }
  return rate;
}

function normalizedEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value.trim().replace(/\/+$/, ""));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== ""))
      return undefined;
    return url.origin.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export function getCopilotConfig(): CopilotConfigResult {
  assertServerEnvironment();

  const liveCallsEnabled = readSetting("AZURE_OPENAI_LIVE_CALLS_ENABLED") === "true";
  const endpointValue = readSetting("AZURE_OPENAI_ENDPOINT");
  const apiKey = readSetting("AZURE_OPENAI_API_KEY");
  const deployment = readSetting("AZURE_OPENAI_DEPLOYMENT");
  const apiVersion = readSetting("AZURE_OPENAI_API_VERSION");
  const endpoint = endpointValue ? normalizedEndpoint(endpointValue) : undefined;
  const errors: string[] = [];
  const inputCostPerMillionTokensUsd = readOptionalRate("AZURE_OPENAI_INPUT_COST_PER_1M_USD", errors);
  const outputCostPerMillionTokensUsd = readOptionalRate("AZURE_OPENAI_OUTPUT_COST_PER_1M_USD", errors);

  if (!liveCallsEnabled) errors.push("Azure model calls are disabled. Set AZURE_OPENAI_LIVE_CALLS_ENABLED=true only after explicit approval and network-policy clearance.");
  if (!endpointValue) errors.push("AZURE_OPENAI_ENDPOINT is required.");
  else if (!endpoint) errors.push("AZURE_OPENAI_ENDPOINT must be an HTTPS origin without a path, query, or fragment.");
  if (!apiKey) errors.push("AZURE_OPENAI_API_KEY is required.");
  if (!deployment || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(deployment))
    errors.push("AZURE_OPENAI_DEPLOYMENT is required and must be a valid deployment name.");
  if (!apiVersion || !/^\d{4}-\d{2}-\d{2}(?:-preview)?$/.test(apiVersion))
    errors.push("AZURE_OPENAI_API_VERSION is required and must be a dated API version.");

  if (errors.length || !endpoint || !apiKey || !deployment || !apiVersion)
    return { ok: false, errors };
  return {
    ok: true,
    config: {
      endpoint,
      apiKey,
      deployment,
      apiVersion,
      liveCallsEnabled: true,
      ...(inputCostPerMillionTokensUsd !== undefined ? { inputCostPerMillionTokensUsd } : {}),
      ...(outputCostPerMillionTokensUsd !== undefined ? { outputCostPerMillionTokensUsd } : {}),
    },
  };
}