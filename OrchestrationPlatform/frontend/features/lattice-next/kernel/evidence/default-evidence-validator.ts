import type { EvidenceValidator } from "./evidence-validator";
import { issue } from "./evidence-validator";
import type { EvidenceCandidate, EvidenceIssue, EvidenceSchemaIdentity } from "./evidence-contracts";

export class BasicEvidenceValidator implements EvidenceValidator {
  readonly name = "lattice-basic-evidence-validator";
  constructor(readonly schema: EvidenceSchemaIdentity) {}
  validate(candidate: EvidenceCandidate): readonly EvidenceIssue[] {
    const issues: EvidenceIssue[] = [];
    if (!candidate.identity.investigationId) issues.push(issue("missing-investigation-id", "Investigation identity is required.", "identity.investigationId"));
    if (candidate.identity.revision < 1) issues.push(issue("invalid-investigation-revision", "Investigation revision must be positive.", "identity.revision"));
    if (!candidate.identity.executionId) issues.push(issue("missing-execution-id", "Execution identity is required.", "identity.executionId"));
    if (!candidate.identity.source.trim()) issues.push(issue("missing-source", "Evidence source is required.", "identity.source"));
    if (!candidate.provenance.provider.trim()) issues.push(issue("missing-provider", "Evidence provider is required.", "provenance.provider"));
    if (!Number.isFinite(Date.parse(candidate.capturedAt))) issues.push(issue("invalid-captured-at", "capturedAt must be an ISO timestamp.", "capturedAt"));
    if (!Number.isFinite(Date.parse(candidate.receivedAt))) issues.push(issue("invalid-received-at", "receivedAt must be an ISO timestamp.", "receivedAt"));
    if (candidate.payload === undefined) issues.push(issue("missing-payload", "Evidence payload cannot be undefined.", "payload"));
    if (["synthetic", "mocked", "hardcoded"].includes(candidate.authority))
      issues.push(issue("non-authoritative-evidence", `${candidate.authority} evidence is isolated from authoritative evidence.`, "authority", "warning"));
    if (candidate.authority === "unavailable" && candidate.completeness !== "unavailable")
      issues.push(issue("authority-completeness-conflict", "Unavailable evidence must declare unavailable completeness.", "completeness"));
    return issues;
  }
}
