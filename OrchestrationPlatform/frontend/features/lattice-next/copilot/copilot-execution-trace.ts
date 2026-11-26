import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

export type CopilotRouteSource =
  | "LegacyFrontend"
  | "UnifiedRuntime"
  | "ImpactRuntime"
  | "FactRuntime"
  | "DocumentRuntime"
  | "Unknown";

export type CopilotTraceJsonValue =
  | null
  | boolean
  | number
  | string
  | CopilotTraceJsonValue[]
  | { [key: string]: CopilotTraceJsonValue };

export interface CopilotTraceContext {
  requestId: string;
  traceId: string;
  traceparent: string;
  routeSource: CopilotRouteSource;
  payloadDetail: "summary" | "full";
}

export interface CopilotExecutionTraceEvent {
  schemaVersion: string;
  event: string;
  stage: string;
  routeSource: CopilotRouteSource;
  payloadDetail: "summary" | "full";
  timestampUtc: string;
  requestId: string;
  traceId: string;
  investigationId?: string;
  snapshotRevision?: number;
  durationMs?: number;
  outcome?: string;
  input?: CopilotTraceJsonValue;
  output?: CopilotTraceJsonValue;
  transformations: CopilotTraceJsonValue[];
  itemsAdded: string[];
  itemsRemoved: string[];
  rejectionReasons: string[];
  payloadRef?: string;
  fullPayload?: CopilotTraceJsonValue;
  diagnostics?: CopilotTraceJsonValue;
}

export interface CopilotTraceStageDetails {
  event: string;
  stage: string;
  investigationId?: string;
  snapshotRevision?: number;
  durationMs?: number;
  outcome?: string;
  input?: unknown;
  output?: unknown;
  transformations?: readonly unknown[];
  itemsAdded?: string[];
  itemsRemoved?: string[];
  rejectionReasons?: string[];
  payloadRef?: string;
  fullPayload?: unknown;
  diagnostics?: unknown;
}

const sensitivePropertyNames = new Set([
  "authorization",
  "authorizationheader",
  "signedauthorizationdecisiontoken",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "secret",
  "cookie",
  "setcookie",
  "credential",
  "credentials",
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function traceEnabled(): boolean {
  const configured = process.env.LATTICE_COPILOT_DIAGNOSTICS_ENABLED;
  return configured === "true" || (configured === undefined && !isProduction());
}

let fullPayloadConfigurationWarningLogged = false;

function fullPayloadTraceAllowed(): boolean {
  return process.env.LATTICE_COPILOT_DIAGNOSTICS_FULL_PAYLOAD_TRACE === "true" &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");
}

function reportFullPayloadConfigurationError(): void {
  if (fullPayloadConfigurationWarningLogged) return;
  fullPayloadConfigurationWarningLogged = true;
  console.error("Full Copilot payload tracing requires an explicit Development/Testing allow-setting.");
}

function normalizePropertyName(propertyName: string): string {
  return propertyName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function sanitize(value: unknown): CopilotTraceJsonValue {
  if (typeof value === "string") {
    return value
      .replace(/\bBearer\s+[^\s,;"'`]+/gi, "Bearer [REDACTED]")
      .replace(
        /\b(api[-_ ]?key|access[-_ ]?token|authorization|cookie|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1=[REDACTED]",
      );
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value !== null && typeof value === "object") {
    const result: { [key: string]: CopilotTraceJsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined && !sensitivePropertyNames.has(normalizePropertyName(key))) {
        result[key] = sanitize(child);
      }
    }
    return result;
  }
  return value === null || typeof value === "boolean" || typeof value === "number" ? value : null;
}

export function createCopilotTraceContext(request?: Request): CopilotTraceContext {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  const requestedFullPayload = request?.headers.get("x-copilot-diagnostic-detail") === "full";
  const payloadDetail = requestedFullPayload && fullPayloadTraceAllowed()
    ? "full"
    : "summary";
  if (requestedFullPayload && payloadDetail !== "full") reportFullPayloadConfigurationError();
  return {
    requestId: randomUUID(),
    traceId,
    traceparent: `00-${traceId}-${spanId}-01`,
    routeSource: "Unknown",
    payloadDetail,
  };
}

export function writeCopilotTraceStage(
  context: CopilotTraceContext,
  details: CopilotTraceStageDetails,
): void {
  const {
    input,
    output,
    transformations,
    fullPayload,
    diagnostics,
    ...stageDetails
  } = details;
  writeCopilotTrace({
    schemaVersion: "1",
    timestampUtc: new Date().toISOString(),
    requestId: context.requestId,
    traceId: context.traceId,
    routeSource: context.routeSource,
    payloadDetail: context.payloadDetail,
    transformations: [],
    itemsAdded: [],
    itemsRemoved: [],
    rejectionReasons: [],
    ...stageDetails,
    ...(input !== undefined ? { input: sanitize(input) } : {}),
    ...(output !== undefined ? { output: sanitize(output) } : {}),
    ...(transformations !== undefined ? { transformations: transformations.map(sanitize) } : {}),
    ...(fullPayload !== undefined ? { fullPayload: sanitize(fullPayload) } : {}),
    ...(diagnostics !== undefined ? { diagnostics: sanitize(diagnostics) } : {}),
  });
}

export function toCopilotTraceJsonValue(value: unknown): CopilotTraceJsonValue {
  return sanitize(value);
}

export function writeCopilotTrace(event: CopilotExecutionTraceEvent): void {
  if (!traceEnabled()) return;

  try {
    const includeFullPayload = event.payloadDetail === "full" && fullPayloadTraceAllowed();
    if (event.payloadDetail === "full" && !includeFullPayload) reportFullPayloadConfigurationError();
    const safeEvent: CopilotExecutionTraceEvent = {
      ...event,
      payloadDetail: includeFullPayload ? "full" : "summary",
      fullPayload: includeFullPayload ? event.fullPayload : undefined,
    };
    console.info(JSON.stringify(sanitize(safeEvent)));
  } catch (error) {
    try {
      console.error("Copilot execution trace write failed.", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    } catch {
      // Diagnostic logging must not affect answer execution.
    }
  }
}
