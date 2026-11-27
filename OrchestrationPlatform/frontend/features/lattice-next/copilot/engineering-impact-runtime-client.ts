import "server-only";

import type {
  CopilotCitation,
  ConversationHistoryTurn,
  ConversationState,
} from "./contracts";
import {
  runtimeAccessTokenProvider,
  type RuntimeAccessTokenProvider,
} from "./runtime-access-token-provider";
import type { CopilotTraceContext } from "./copilot-execution-trace";

export type EngineeringImpactRuntimeDisposition =
  | "Answer"
  | "Clarify"
  | "Abstain"
  | "Deny"
  | "Failed";

export interface EngineeringImpactRuntimeSource {
  evidenceId: string;
  sourceType: string;
  sourceSystem: string;
  recordId: string;
  provenanceId: string;
  authority: string;
  provider: string;
  authorizationDecisionId: string;
  citationId?: string | null;
  location?: string | null;
  deepLink?: string | null;
  capturedAt?: string | null;
  revision?: string | null;
}

export interface EngineeringImpactRuntimeResponse {
  investigationId: string;
  requestContext: {
    requestId: string;
    traceId: string;
    parentRequestId?: string | null;
    conversationId?: string | null;
    turnId?: string | null;
  };
  disposition: EngineeringImpactRuntimeDisposition;
  summary?: string | null;
  impacts: readonly {
    claimId: string;
    explanation: string;
    evidenceIds: readonly string[];
    sourceIds: readonly string[];
  }[];
  facts?: readonly {
    factId: string;
    exactValue: unknown;
    exactValueJson?: string;
    evidenceIds: readonly string[];
    sourceIds: readonly string[];
  }[];
  applicationContexts?: readonly {
    candidateId: string;
    evidenceIds: readonly string[];
    sourceIds: readonly string[];
  }[];
  sourceEvidence?: readonly {
    passageId: string;
    explanation: string;
    evidenceIds: readonly string[];
    sourceIds: readonly string[];
  }[];
  sources: readonly EngineeringImpactRuntimeSource[];
  issues: readonly {
    code: string;
    message: string;
    claimId?: string | null;
  }[];
  contextPackageId?: string | null;
  semanticSupportStatus?: string;
  continuationState?: ConversationState | null;
  continuationStateStatus?: "invalid";
}

export interface EngineeringImpactRuntimeRequest {
  question: string;
  investigationId: string;
  conversationId: string;
  turnId: string;
  parentTurnId?: string;
  previousConversationState?: ConversationState;
  conversationHistory?: readonly ConversationHistoryTurn[];
  snapshotRevision?: number;
  traceContext?: CopilotTraceContext;
  signal?: AbortSignal;
}

export type EngineeringImpactRuntimeCallResult =
  | { status: "response"; response: EngineeringImpactRuntimeResponse }
  | { status: "denied" }
  | { status: "unavailable"; code: string }
  | { status: "failed"; code: string };

export interface EngineeringImpactRuntimeReadiness {
  endpointConfigured: boolean;
  credentialProviderConfigured: boolean;
}

export interface EngineeringImpactRuntimeClientOptions {
  endpoint?: string;
  accessTokenProvider?: RuntimeAccessTokenProvider;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function configuredEndpoint(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim().replace(/\/+$/, ""));
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname))) {
      return undefined;
    }

    const apiRoot = url.pathname.replace(/\/+$/, "").endsWith("/api")
      ? url.pathname.replace(/\/+$/, "")
      : `${url.pathname.replace(/\/+$/, "")}/api`;
    return `${url.origin}${apiRoot}`;
  } catch {
    return undefined;
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function parseConversationState(value: unknown): ConversationState | undefined {
  const state = object(value);
  const applicationFilters = object(state?.applicationFilters);
  const impactScope = object(state?.impactScope);
  const validStringArray = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) && candidate.every((item) => typeof item === "string");
  const rawReferences = state?.currentValidatedEntityRefs;
  const references = Array.isArray(rawReferences)
    ? rawReferences.flatMap((item) => {
        const reference = object(item);
        return reference &&
          typeof reference.canonicalId === "string" &&
          typeof reference.entityKind === "string" &&
          typeof reference.application === "string"
            ? [{
                canonicalId: reference.canonicalId,
                entityKind: reference.entityKind,
                application: reference.application,
              }]
            : [];
      })
    : undefined;
  const rawUnresolvedReference = state?.unresolvedReference;
  const unresolvedReference = rawUnresolvedReference === null
    ? null
    : object(rawUnresolvedReference);
  const parsedUnresolvedReference = unresolvedReference && typeof unresolvedReference.reasonCode === "string" &&
      validStringArray(unresolvedReference.candidateCanonicalIds) &&
      typeof unresolvedReference.createdAt === "string"
    ? {
        reasonCode: unresolvedReference.reasonCode,
        candidateCanonicalIds: unresolvedReference.candidateCanonicalIds,
        createdAt: unresolvedReference.createdAt,
      }
    : undefined;
  const outputDimension = state?.outputDimension;
  const lastTurnDisposition = state?.lastTurnDisposition;
  if (!state || !applicationFilters || !impactScope ||
      state.schemaVersion !== 1 ||
      typeof state.conversationId !== "string" ||
      typeof state.investigationId !== "string" ||
      !Number.isSafeInteger(state.stateVersion) ||
      Number(state.stateVersion) < 1 ||
      !validStringArray(state.currentSubjectIds) || state.currentSubjectIds.length === 0 ||
      !Array.isArray(rawReferences) || !references || references.length !== rawReferences.length ||
      !validStringArray(applicationFilters.sourceApplications) ||
      !validStringArray(applicationFilters.targetApplications) ||
      !validStringArray(state.relationshipFilters) ||
      !validStringArray(impactScope.relationshipTypes) ||
      !validStringArray(impactScope.sourceSystems) ||
      !(impactScope.maxHops === null || Number.isSafeInteger(impactScope.maxHops)) ||
      !(impactScope.asOf === null || typeof impactScope.asOf === "string") ||
      !(outputDimension === "impact" || outputDimension === "ownership" ||
        outputDimension === "explanation" || outputDimension === "comparison") ||
      !(state.previousTurnId === null || typeof state.previousTurnId === "string") ||
      !(state.previousContextPackageId === null || typeof state.previousContextPackageId === "string") ||
      !(state.snapshotRevision === null || Number.isSafeInteger(state.snapshotRevision)) ||
      !(state.sourceVersion === null || typeof state.sourceVersion === "string") ||
      !(state.ontologyVersion === null || typeof state.ontologyVersion === "string") ||
      typeof state.ownerFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(state.ownerFingerprint) ||
      (rawUnresolvedReference !== null && !parsedUnresolvedReference) ||
      !(lastTurnDisposition === "answer" || lastTurnDisposition === "clarify") ||
      typeof state.createdAt !== "string" ||
      typeof state.updatedAt !== "string" ||
      typeof state.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(state.createdAt)) ||
      !Number.isFinite(Date.parse(state.updatedAt)) ||
      !Number.isFinite(Date.parse(state.expiresAt)) ||
      Date.parse(state.expiresAt) <= Date.parse(state.updatedAt)) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    conversationId: state.conversationId,
    investigationId: state.investigationId,
    stateVersion: Number(state.stateVersion),
    currentSubjectIds: state.currentSubjectIds,
    currentValidatedEntityRefs: references,
    applicationFilters: {
      sourceApplications: applicationFilters.sourceApplications,
      targetApplications: applicationFilters.targetApplications,
    },
    relationshipFilters: state.relationshipFilters,
    impactScope: {
      relationshipTypes: impactScope.relationshipTypes,
      maxHops: impactScope.maxHops as number | null,
      sourceSystems: impactScope.sourceSystems,
      asOf: impactScope.asOf as string | null,
    },
    outputDimension,
    previousTurnId: state.previousTurnId as string | null,
    previousContextPackageId: state.previousContextPackageId as string | null,
    snapshotRevision: state.snapshotRevision as number | null,
    sourceVersion: state.sourceVersion as string | null,
    ontologyVersion: state.ontologyVersion as string | null,
    ownerFingerprint: state.ownerFingerprint as string | null,
    unresolvedReference: parsedUnresolvedReference ?? null,
    lastTurnDisposition,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    expiresAt: state.expiresAt,
  };
}

function parseRuntimeResponse(value: unknown): EngineeringImpactRuntimeResponse | undefined {
  const body = object(value);
  const requestContext = object(body?.requestContext);
  const impacts = body?.impacts;
  const facts = body?.facts;
  const applicationContexts = body?.applicationContexts;
  const sourceEvidence = body?.sourceEvidence;
  const sources = body?.sources;
  const issues = body?.issues;
  const dispositions: Record<string, EngineeringImpactRuntimeDisposition> = {
    answer: "Answer",
    clarify: "Clarify",
    abstain: "Abstain",
    deny: "Deny",
    failed: "Failed",
  };
  const disposition = typeof body?.disposition === "string"
    ? dispositions[body.disposition.replace(/[-_]/g, "").toLowerCase()]
    : undefined;
  if (!body || !requestContext || !disposition ||
      typeof body.investigationId !== "string" ||
      typeof requestContext.requestId !== "string" ||
      typeof requestContext.traceId !== "string" ||
      !Array.isArray(impacts) ||
      (facts !== undefined && !Array.isArray(facts)) ||
      (applicationContexts !== undefined && !Array.isArray(applicationContexts)) ||
      (sourceEvidence !== undefined && !Array.isArray(sourceEvidence)) ||
      !Array.isArray(sources) || !Array.isArray(issues)) {
    return undefined;
  }

  const parsedImpacts = impacts.flatMap((item) => {
    const impact = object(item);
    const evidenceIds = asStringArray(impact?.evidenceIds);
    const sourceIds = asStringArray(impact?.sourceIds);
    if (!impact || typeof impact.claimId !== "string" ||
        typeof impact.explanation !== "string" || !evidenceIds || !sourceIds) return [];
    return [{
      claimId: impact.claimId,
      explanation: impact.explanation,
      evidenceIds,
      sourceIds,
    }];
  });
  if (parsedImpacts.length !== impacts.length) return undefined;

  const parsedFacts = (facts ?? []).flatMap((item) => {
    const fact = object(item);
    const evidenceIds = asStringArray(fact?.evidenceIds);
    const sourceIds = asStringArray(fact?.sourceIds);
    if (!fact || typeof fact.factId !== "string" || !("exactValue" in fact) ||
        !evidenceIds || !sourceIds) return [];
    return [{
      factId: fact.factId,
      exactValue: fact.exactValue,
      ...(asString(fact.exactValueJson) !== undefined
        ? { exactValueJson: asString(fact.exactValueJson) }
        : {}),
      evidenceIds,
      sourceIds,
    }];
  });
  if (parsedFacts.length !== (facts ?? []).length) return undefined;

  const parsedApplicationContexts = (applicationContexts ?? []).flatMap((item) => {
    const applicationContext = object(item);
    const evidenceIds = asStringArray(applicationContext?.evidenceIds);
    const sourceIds = asStringArray(applicationContext?.sourceIds);
    if (!applicationContext || typeof applicationContext.candidateId !== "string" ||
        !evidenceIds || !sourceIds) return [];
    return [{
      candidateId: applicationContext.candidateId,
      evidenceIds,
      sourceIds,
    }];
  });
  if (parsedApplicationContexts.length !== (applicationContexts ?? []).length) return undefined;

  const parsedSourceEvidence = (sourceEvidence ?? []).flatMap((item) => {
    const assertion = object(item);
    const evidenceIds = asStringArray(assertion?.evidenceIds);
    const sourceIds = asStringArray(assertion?.sourceIds);
    if (!assertion || typeof assertion.passageId !== "string" ||
        typeof assertion.explanation !== "string" || !evidenceIds || !sourceIds) return [];
    return [{
      passageId: assertion.passageId,
      explanation: assertion.explanation,
      evidenceIds,
      sourceIds,
    }];
  });
  if (parsedSourceEvidence.length !== (sourceEvidence ?? []).length) return undefined;

  const parsedSources = sources.flatMap((item) => {
    const source = object(item);
    if (!source ||
        typeof source.evidenceId !== "string" ||
        typeof source.sourceType !== "string" ||
        typeof source.sourceSystem !== "string" ||
        typeof source.recordId !== "string" ||
        typeof source.provenanceId !== "string" ||
        typeof source.authority !== "string" ||
        typeof source.provider !== "string" ||
        typeof source.authorizationDecisionId !== "string") return [];
    return [{
      evidenceId: source.evidenceId,
      sourceType: source.sourceType,
      sourceSystem: source.sourceSystem,
      recordId: source.recordId,
      provenanceId: source.provenanceId,
      authority: source.authority,
      provider: source.provider,
      authorizationDecisionId: source.authorizationDecisionId,
      ...(asNullableString(source.citationId) !== undefined ? { citationId: asNullableString(source.citationId) } : {}),
      ...(asNullableString(source.location) !== undefined ? { location: asNullableString(source.location) } : {}),
      ...(asNullableString(source.deepLink) !== undefined ? { deepLink: asNullableString(source.deepLink) } : {}),
      ...(asNullableString(source.capturedAt) !== undefined ? { capturedAt: asNullableString(source.capturedAt) } : {}),
      ...(asNullableString(source.revision) !== undefined ? { revision: asNullableString(source.revision) } : {}),
    }];
  });
  if (parsedSources.length !== sources.length) return undefined;

  const parsedIssues = issues.flatMap((item) => {
    const issue = object(item);
    if (!issue || typeof issue.code !== "string" || typeof issue.message !== "string") return [];
    return [{
      code: issue.code,
      message: issue.message,
      ...(asNullableString(issue.claimId) !== undefined ? { claimId: asNullableString(issue.claimId) } : {}),
    }];
  });
  if (parsedIssues.length !== issues.length) return undefined;

  const hasContinuationState = body.continuationState !== undefined && body.continuationState !== null;
  let continuationState: ConversationState | null | undefined;
  if (body.continuationState === undefined) {
    continuationState = undefined;
  } else if (body.continuationState === null) {
    continuationState = null;
  } else {
    continuationState = parseConversationState(body.continuationState);
  }

  return {
    investigationId: body.investigationId,
    requestContext: {
      requestId: requestContext.requestId,
      traceId: requestContext.traceId,
      ...(asNullableString(requestContext.parentRequestId) !== undefined ? { parentRequestId: asNullableString(requestContext.parentRequestId) } : {}),
      ...(asNullableString(requestContext.conversationId) !== undefined ? { conversationId: asNullableString(requestContext.conversationId) } : {}),
      ...(asNullableString(requestContext.turnId) !== undefined ? { turnId: asNullableString(requestContext.turnId) } : {}),
    },
    disposition,
    ...(asNullableString(body.summary) !== undefined ? { summary: asNullableString(body.summary) } : {}),
    impacts: parsedImpacts,
    facts: parsedFacts,
    applicationContexts: parsedApplicationContexts,
    sourceEvidence: parsedSourceEvidence,
    sources: parsedSources,
    issues: parsedIssues,
    ...(asNullableString(body.contextPackageId) !== undefined ? { contextPackageId: asNullableString(body.contextPackageId) } : {}),
    ...(asString(body.semanticSupportStatus) !== undefined ? { semanticSupportStatus: asString(body.semanticSupportStatus) } : {}),
    ...(continuationState !== undefined ? { continuationState } : {}),
    ...(hasContinuationState && !continuationState ? { continuationStateStatus: "invalid" as const } : {}),
  };
}

function logInvalidRuntimeResponse(
  request: EngineeringImpactRuntimeRequest,
  response: Response,
  reason: "invalid-json" | "invalid-shape",
  responseBody: unknown,
): void {
  if (request.traceContext?.payloadDetail !== "full") return;

  console.warn("[engineering-impact-runtime] Response parsing failed.", {
    requestId: request.traceContext.requestId,
    reason,
    status: response.status,
    contentType: response.headers.get("content-type"),
    responseBody,
  });
}

export function runtimeResponseCitations(
  response: EngineeringImpactRuntimeResponse,
): { citations: readonly CopilotCitation[]; sourceCitationIds: ReadonlyMap<string, string> } {
  const referencedSourceIds = new Set([
    ...response.impacts.flatMap((impact) => impact.sourceIds),
    ...(response.facts ?? []).flatMap((fact) => fact.sourceIds),
    ...(response.applicationContexts ?? []).flatMap((context) => context.sourceIds),
    ...(response.sourceEvidence ?? []).flatMap((assertion) => assertion.sourceIds),
  ]);
  const citations: CopilotCitation[] = [];
  const sourceCitationIds = new Map<string, string>();
  const seenCitationIds = new Set<string>();

  for (const source of response.sources) {
    const sourceIdentifiers = [
      source.citationId,
      source.provenanceId,
      source.recordId,
      source.evidenceId,
    ].filter((value): value is string => Boolean(value));
    const referenced = sourceIdentifiers.filter((identifier) => referencedSourceIds.has(identifier));
    if (!referenced.length) continue;

    const referenceId = source.citationId || source.provenanceId || source.recordId || source.evidenceId;
    const citationKind = source.sourceType === "source-evidence-passage" ? "evidence" : "source";
    const citationId = `cite:${citationKind}:${encodeURIComponent(referenceId)}`;
    if (!seenCitationIds.has(citationId)) {
      const deepLink = safeDeepLink(source.deepLink);
      citations.push({
        citationId,
        kind: citationKind,
        label: [source.sourceSystem, source.recordId].filter(Boolean).join(" "),
        source: source.sourceSystem,
        nativeId: source.recordId,
        ...(source.location || deepLink ? { summary: source.location ?? deepLink } : {}),
        ...(deepLink ? { deepLink } : {}),
      });
      seenCitationIds.add(citationId);
    }
    for (const identifier of referenced) sourceCitationIds.set(identifier, citationId);
  }

  return { citations, sourceCitationIds };
}

function safeDeepLink(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function defaultEndpoint(): string | undefined {
  return process.env.ORCHESTRATION_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    (process.env.NODE_ENV === "development" ? "http://localhost:5212" : undefined);
}

export class EngineeringImpactRuntimeClient {
  private readonly endpoint: string | undefined;
  private readonly tokenProvider: RuntimeAccessTokenProvider;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number | undefined;

  constructor(options: EngineeringImpactRuntimeClientOptions = {}) {
    this.endpoint = configuredEndpoint(options.endpoint ?? defaultEndpoint());
    this.tokenProvider = options.accessTokenProvider ?? runtimeAccessTokenProvider;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs)
      ? Math.max(options.timeoutMs, 1)
      : undefined;
  }

  readiness(): EngineeringImpactRuntimeReadiness {
    return {
      endpointConfigured: Boolean(this.endpoint),
      credentialProviderConfigured: this.tokenProvider.isConfigured(),
    };
  }

  async answer(request: EngineeringImpactRuntimeRequest): Promise<EngineeringImpactRuntimeCallResult> {
    if (request.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    if (!this.endpoint) return { status: "unavailable", code: "runtime-endpoint-not-configured" };
    if (!this.tokenProvider.isConfigured()) return { status: "unavailable", code: "runtime-credential-not-configured" };

    const timeoutSignal = this.timeoutMs === undefined ? undefined : AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal && timeoutSignal
      ? AbortSignal.any([request.signal, timeoutSignal])
      : request.signal ?? timeoutSignal;
    let credential;
    try {
      credential = await this.tokenProvider.getAccessToken(signal);
    } catch {
      if (request.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return { status: "failed", code: "runtime-credential-acquisition-failed" };
    }
    if (request.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    if (timeoutSignal?.aborted) {
      return { status: "failed", code: "runtime-credential-acquisition-failed" };
    }
    if (credential.status === "unavailable") {
      return { status: "unavailable", code: "runtime-credential-not-configured" };
    }
    if (credential.status === "failed" || !credential.accessToken) {
      return { status: "failed", code: "runtime-credential-acquisition-failed" };
    }

    let response: Response;
    try {
      response = await this.fetcher(`${this.endpoint}/engineering/impact-answer`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credential.accessToken}`,
          ...(request.traceContext
            ? {
                "X-Copilot-Request-Id": request.traceContext.requestId,
                "X-Copilot-Route-Source": request.traceContext.routeSource,
                traceparent: request.traceContext.traceparent,
              }
            : {}),
          ...(request.snapshotRevision !== undefined
            ? { "X-Copilot-Snapshot-Revision": String(request.snapshotRevision) }
            : {}),
          ...(request.traceContext?.payloadDetail === "full"
            ? { "X-Copilot-Diagnostic-Detail": "full" }
            : {}),
        },
        body: JSON.stringify({
          investigationId: request.investigationId,
          question: request.question,
          conversationId: request.conversationId,
          turnId: request.turnId,
          ...(request.parentTurnId ? { parentTurnId: request.parentTurnId } : {}),
          ...(request.previousConversationState
            ? { previousConversationState: request.previousConversationState }
            : {}),
          ...(request.conversationHistory?.length
            ? { conversationHistory: request.conversationHistory }
            : {}),
        }),
        cache: "no-store",
        signal,
      });
    } catch {
      if (request.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return {
        status: "unavailable",
        code: timeoutSignal?.aborted ? "runtime-request-timeout" : "runtime-request-unavailable",
      };
    }

    if (response.status === 401) return { status: "failed", code: "runtime-credential-rejected" };
    if (response.status === 403) return { status: "denied" };

    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch {
      if (response.status === 503) return { status: "unavailable", code: "runtime-authorization-unavailable" };
      return { status: "failed", code: "runtime-response-invalid" };
    }

    let body: unknown;
    try {
      body = JSON.parse(responseBody);
    } catch {
      logInvalidRuntimeResponse(request, response, "invalid-json", responseBody);
      if (response.status === 503) return { status: "unavailable", code: "runtime-authorization-unavailable" };
      return { status: "failed", code: "runtime-response-invalid" };
    }

    const result = parseRuntimeResponse(body);
    if (result) {
      if (result.investigationId !== request.investigationId) {
        return { status: "failed", code: "runtime-investigation-mismatch" };
      }
      if (result.disposition === "Deny") return { status: "denied" };
      return { status: "response", response: result };
    }

    logInvalidRuntimeResponse(request, response, "invalid-shape", body);
    if (response.status === 503) return { status: "unavailable", code: "runtime-authorization-unavailable" };
    return { status: "failed", code: response.ok ? "runtime-response-invalid" : "runtime-request-failed" };
  }
}

export const engineeringImpactRuntimeClient = new EngineeringImpactRuntimeClient();
