import type { LatticeHandoff } from "../../contracts/handoff";
import type { NormalizedSearchResult } from "../../discovery/contracts";
import { resolveSelectedStructure } from "../../discovery/structure-resolver";
import { investigateConfigit } from "../../infrastructure/configit-intelligence-client";
import { investigateSap } from "../../infrastructure/sap-intelligence-client";
import { investigateWindchill } from "../../infrastructure/windchill-intelligence-client";
import { projectCodebeamerIntelligence } from "../../engines/project-codebeamer-intelligence";
import type { SourceOperationCommand, SourceOperationError } from "../contracts/source-operation";
import type { SourceOperationResult } from "../contracts/source-operation-result";
import type { SourceExecutionPort } from "../ports/source-execution-port";
import {
  rejectedEvidenceResult,
  wrapCurrentIntelligenceEvidence,
  wrapCurrentStructureEvidence,
} from "./current-evidence-adapter";

export interface CurrentHandoffProvider {
  getHandoff(command: SourceOperationCommand): Promise<LatticeHandoff | undefined>;
}

const currentSources = new Set(["sap", "teamcenter", "windchill", "configit", "codebeamer"]);

function toSearchResult(command: SourceOperationCommand): NormalizedSearchResult {
  const selection = command.selection;
  if (!currentSources.has(selection.source))
    throw new Error(`Unsupported current source: ${selection.source}`);
  const metadata = Object.fromEntries(
    Object.entries(selection.metadata ?? {}).map(([key, value]) => [key, value]),
  );
  return {
    resultId: metadata.candidateId ?? metadata.canonicalId ?? `${selection.source}:${selection.nativeId}`,
    source: selection.source as NormalizedSearchResult["source"],
    nativeId: selection.nativeId,
    displayName: selection.displayName,
    entityType: metadata.entityType ?? "engineering-item",
    matchCategory: "source-native-reference",
    matchReason: "Selected source identity supplied by the Investigation Kernel.",
    capabilityHints: [],
    sourceMetadata: metadata,
    provenance: {
      providerMode: "capability",
      retrievedAt: new Date().toISOString(),
      sourceRoute: "investigation-kernel/current-source-execution-adapter",
    },
    canStartInvestigation: true,
  };
}

function operationError(cause: unknown, aborted: boolean): SourceOperationError {
  const message = cause instanceof Error ? cause.message : "Source operation failed.";
  if (aborted)
    return { code: "source-cancelled", message, retryable: false };
  if (/timeout|timed out|exceeded/i.test(message))
    return { code: "source-timeout", message, retryable: true };
  if (/unauthor|forbidden/i.test(message))
    return { code: "authorization-failed", message, retryable: false };
  if (/authentication|sign.?in|login/i.test(message))
    return { code: "authentication-failed", message, retryable: false };
  if (/not found|no .* source|no usable/i.test(message))
    return { code: "not-found", message, retryable: false };
  if (/invalid .*contract|malformed/i.test(message))
    return { code: "contract-invalid", message, retryable: false };
  return { code: "unknown", message, retryable: true };
}

const completedObservation = (value: string | undefined): string => value ?? new Date().toISOString();

export class CurrentSourceExecutionAdapter implements SourceExecutionPort {
  private readonly resolvedStructures = new Map<string, { value: Awaited<ReturnType<typeof resolveSelectedStructure>>; observedAt: string }>();

  constructor(private readonly handoffs: CurrentHandoffProvider) {}

  private structureKey(source: string, nativeId: string): string {
    return `${source}:${nativeId}`;
  }

  resolvedHandoff(investigationId: string, subjectLabel: string, selections: readonly { source: string; nativeId: string }[]): LatticeHandoff | undefined {
    const sources = selections.flatMap((selection) => {
      const cached = this.resolvedStructures.get(this.structureKey(selection.source, selection.nativeId));
      if (!cached) return [];
      return [{
        source: selection.source as LatticeHandoff["sources"][number]["source"],
        label: selection.source,
        root: cached.value.root,
        nativeId: selection.nativeId,
        jobId: cached.value.jobId,
        capturedAt: cached.observedAt,
        completeness: cached.value.state === "ready" ? "complete" as const : "partial" as const,
        intelligencePayload: cached.value.intelligencePayload,
      }];
    });
    if (!sources.length) return undefined;
    const createdAt = new Date().toISOString();
    return {
      version: 2,
      handoffId: investigationId,
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
      subjectLabel,
      sources,
    };
  }

  private cachedHandoff(command: SourceOperationCommand): LatticeHandoff | undefined {
    const cached = this.resolvedStructures.get(this.structureKey(command.selection.source, command.selection.nativeId));
    if (!cached) return undefined;
    return {
      version: 2,
      handoffId: String(command.identity.investigationId),
      createdAt: cached.observedAt,
      expiresAt: new Date(Date.parse(cached.observedAt) + 24 * 60 * 60 * 1000).toISOString(),
      subjectLabel: command.selection.displayName,
      sources: [{
        source: command.selection.source as LatticeHandoff["sources"][number]["source"],
        label: command.selection.source,
        root: cached.value.root,
        nativeId: command.selection.nativeId,
        jobId: cached.value.jobId,
        capturedAt: cached.observedAt,
        completeness: cached.value.state === "ready" ? "complete" : "partial",
        intelligencePayload: cached.value.intelligencePayload,
      }],
    };
  }

  async execute(command: SourceOperationCommand): Promise<SourceOperationResult> {
    const startedAt = new Date().toISOString();
    try {
      if (command.identity.operation === "resolve-structure") {
        const resolved = await resolveSelectedStructure(
          toSearchResult(command),
          command.signal,
        );
        const completedAt = new Date().toISOString();
        if (resolved.state === "ready" || resolved.state === "partial") {
          this.resolvedStructures.set(this.structureKey(command.selection.source, command.selection.nativeId), { value: resolved, observedAt: completedAt });
        }
        const evidence = wrapCurrentStructureEvidence(resolved, {
          identity: command.identity,
          observedAt: completedAt,
          warnings: resolved.warning ? [resolved.warning] : [],
        });
        const status = resolved.state === "ready"
          ? "succeeded"
          : resolved.state === "partial"
            ? "partial"
            : resolved.state;
        return {
          identity: command.identity,
          status,
          startedAt,
          completedAt,
          durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
          evidence,
          warnings: evidence.warnings,
          error: evidence.validation.status === "rejected"
            ? {
                code: resolved.state === "timed-out" ? "source-timeout" : resolved.state === "cancelled" ? "source-cancelled" : "unknown",
                message: resolved.warning ?? `Structure resolution ${resolved.state}.`,
                retryable: resolved.state === "timed-out" || resolved.state === "failed",
              }
            : undefined,
        };
      }

      const handoff = await this.handoffs.getHandoff(command) ?? this.cachedHandoff(command);
      if (!handoff) {
        const completedAt = new Date().toISOString();
        return rejectedEvidenceResult(
          command.identity,
          startedAt,
          completedAt,
          "Current intelligence execution requires a source handoff.",
        );
      }
      const current = handoff.sources.some((item) => item.source === command.selection.source)
        ? { ...handoff, sources: handoff.sources.filter((item) => item.source === command.selection.source) }
        : handoff;
      const value = command.selection.source === "windchill"
        ? await investigateWindchill(current, command.signal)
        : command.selection.source === "sap"
          ? await investigateSap(current, command.signal)
          : command.selection.source === "configit"
            ? await investigateConfigit(current, command.signal)
            : command.selection.source === "codebeamer"
              ? projectCodebeamerIntelligence(
                  String(command.identity.investigationId),
                  this.resolvedStructures.get(this.structureKey(command.selection.source, command.selection.nativeId))?.value,
                  completedObservation(this.resolvedStructures.get(this.structureKey(command.selection.source, command.selection.nativeId))?.observedAt),
                )
              : undefined;
      const completedAt = new Date().toISOString();
      if (!value)
        return {
          identity: command.identity,
          status: "empty",
          startedAt,
          completedAt,
          durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
          warnings: [`No current intelligence client is registered for ${command.selection.source}.`],
        };
      const evidence = wrapCurrentIntelligenceEvidence(value, {
        identity: command.identity,
        observedAt: completedAt,
      });
      if (evidence.validation.status === "rejected")
        return rejectedEvidenceResult(
          command.identity,
          startedAt,
          completedAt,
          "Current intelligence response failed contract validation.",
        );
      const sourceState = value.sources.find((item) => item.source === command.selection.source)?.status;
      const status = sourceState === "partial" || sourceState === "capability-limited"
        ? "partial"
        : sourceState === "unavailable"
          ? "unavailable"
          : sourceState === "timed-out"
            ? "timed-out"
            : sourceState === "cancelled"
              ? "cancelled"
              : sourceState === "failed"
                ? "failed"
                : "succeeded";
      return {
        identity: command.identity,
        status,
        startedAt,
        completedAt,
        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
        evidence,
        warnings: evidence.warnings,
      };
    } catch (cause) {
      const completedAt = new Date().toISOString();
      const error = operationError(cause, command.signal.aborted);
      return {
        identity: command.identity,
        status: error.code === "source-cancelled" ? "cancelled" : error.code === "source-timeout" ? "timed-out" : "failed",
        startedAt,
        completedAt,
        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
        warnings: [],
        error,
      };
    }
  }
}
