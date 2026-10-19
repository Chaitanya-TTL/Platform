import {
  ENGINEERING_INTELLIGENCE_CONTRACT_VERSION,
  isEngineeringIntelligenceInvestigationV1,
  type EngineeringIntelligenceInvestigationV1,
  type IntelligenceAuthority,
} from "../../contracts/intelligence-v1";
import type { ResolvedStructure } from "../../discovery/structure-resolver";
import type {
  EvidenceAuthority,
  EvidenceEnvelope,
  EvidenceValidation,
} from "../contracts/evidence-envelope";
import type { ExecutionIdentity } from "../contracts/investigation-identity";
import type { SourceOperationResult } from "../contracts/source-operation-result";

const authorityMap: Readonly<Record<IntelligenceAuthority, EvidenceAuthority>> = {
  "source-authoritative": "source-authoritative",
  "backend-derived": "backend-derived",
  "frontend-derived": "frontend-derived",
  "poc-synthetic": "synthetic",
  hardcoded: "synthetic",
  mocked: "synthetic",
  unavailable: "unavailable",
};

export interface CurrentEvidenceContext {
  identity: ExecutionIdentity;
  observedAt: string;
  warnings?: readonly string[];
}

export function wrapCurrentIntelligenceEvidence(
  value: unknown,
  context: CurrentEvidenceContext,
): EvidenceEnvelope<EngineeringIntelligenceInvestigationV1> {
  const accepted = isEngineeringIntelligenceInvestigationV1(value);
  const validation: EvidenceValidation = {
    status: accepted ? "accepted" : "rejected",
    schemaVersion: accepted ? ENGINEERING_INTELLIGENCE_CONTRACT_VERSION : "unknown",
    issues: accepted ? [] : ["invalid-engineering-intelligence-contract"],
  };
  if (!accepted) {
    return {
      envelopeVersion: "1.0",
      identity: context.identity,
      authority: "unavailable",
      observedAt: context.observedAt,
      freshness: "unknown",
      validation,
      warnings: context.warnings ?? [],
      payload: value as EngineeringIntelligenceInvestigationV1,
    };
  }
  const authorities = new Set<IntelligenceAuthority>([
    value.subject.provenance.authority,
    ...value.entities.map((item) => item.provenance.authority),
    ...value.relationships.map((item) => item.provenance.authority),
  ]);
  const authority = authorities.has("poc-synthetic") || authorities.has("hardcoded") || authorities.has("mocked")
    ? "synthetic"
    : authorityMap[value.subject.provenance.authority];
  return {
    envelopeVersion: "1.0",
    identity: context.identity,
    authority,
    observedAt: value.temporal.capturedAt ?? context.observedAt,
    freshness: value.temporal.freshness === "not-applicable" ? "unknown" : value.temporal.freshness,
    validation,
    warnings: context.warnings ?? [],
    payload: value,
  };
}

export function wrapCurrentStructureEvidence(
  value: ResolvedStructure,
  context: CurrentEvidenceContext,
): EvidenceEnvelope<ResolvedStructure> {
  const accepted = value.state === "ready" || value.state === "partial";
  return {
    envelopeVersion: "1.0",
    identity: context.identity,
    authority: accepted ? "source-authoritative" : "unavailable",
    observedAt: context.observedAt,
    freshness: "unknown",
    validation: {
      status: accepted ? "accepted" : "rejected",
      schemaVersion: "current-resolved-structure-v1",
      issues: accepted ? [] : [`structure-resolution-${value.state}`],
    },
    warnings: [...(context.warnings ?? []), ...(value.warning ? [value.warning] : [])],
    payload: value,
  };
}

export function rejectedEvidenceResult(
  identity: ExecutionIdentity,
  startedAt: string,
  completedAt: string,
  message: string,
): SourceOperationResult {
  return {
    identity,
    status: "failed",
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    warnings: [],
    error: {
      code: "contract-invalid",
      message,
      retryable: false,
    },
  };
}
