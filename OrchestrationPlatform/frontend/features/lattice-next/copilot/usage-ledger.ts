import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

export interface CopilotUsageRecord {
  timestamp: string;
  requestId: string;
  deployment: string;
  apiVersion: string;
  attempt: number;
  httpStatus: number | "network-error" | "timeout";
  outcome: "success" | "provider-http-error" | "invalid-provider-response" | "network-error" | "timeout";
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputCostPerMillionTokensUsd?: number;
  outputCostPerMillionTokensUsd?: number;
}

const CSV_HEADER = [
  "timestamp_utc",
  "request_id",
  "deployment",
  "api_version",
  "attempt",
  "http_status",
  "outcome",
  "latency_ms",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "estimated_cost_usd",
].join(",");

let pendingWrite: Promise<void> = Promise.resolve();

function csv(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tokenCount(value: number | undefined): number | undefined {
  return Number.isSafeInteger(value) && value! >= 0 ? value : undefined;
}

function estimatedCostUsd(record: CopilotUsageRecord): number | undefined {
  const promptTokens = tokenCount(record.promptTokens);
  const completionTokens = tokenCount(record.completionTokens);
  const inputRate = record.inputCostPerMillionTokensUsd;
  const outputRate = record.outputCostPerMillionTokensUsd;
  if (promptTokens === undefined || completionTokens === undefined ||
      inputRate === undefined || outputRate === undefined) return undefined;
  return Number(((promptTokens * inputRate + completionTokens * outputRate) / 1_000_000).toFixed(8));
}

function row(record: CopilotUsageRecord): string {
  const values: (string | number | undefined)[] = [
    record.timestamp,
    record.requestId,
    record.deployment,
    record.apiVersion,
    record.attempt,
    record.httpStatus,
    record.outcome,
    Math.max(0, Math.round(record.latencyMs)),
    tokenCount(record.promptTokens),
    tokenCount(record.completionTokens),
    tokenCount(record.totalTokens),
    estimatedCostUsd(record),
  ];
  return `${values.map(csv).join(",")}\r\n`;
}

async function append(record: CopilotUsageRecord, filePath: string): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  let needsHeader = false;
  try {
    needsHeader = (await fs.stat(filePath)).size === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    needsHeader = true;
  }
  await fs.appendFile(filePath, `${needsHeader ? `${CSV_HEADER}\r\n` : ""}${row(record)}`, "utf8");
}

export function recordCopilotUsage(record: CopilotUsageRecord): Promise<void> {
  const configuredPath = process.env.LATTICE_COPILOT_USAGE_LOG_PATH?.trim();
  const filePath = path.resolve(/* turbopackIgnore: true */ configuredPath || path.join(process.cwd(), ".lattice-data", "copilot-usage.csv"));
  const write = pendingWrite.then(() => append(record, filePath));
  pendingWrite = write.catch(() => undefined);
  return write;
}