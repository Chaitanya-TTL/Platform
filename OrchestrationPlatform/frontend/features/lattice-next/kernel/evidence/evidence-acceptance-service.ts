import { hashEvidencePayload } from "./evidence-hasher";
import { asEvidenceId, type AcceptedEvidenceEnvelope, type EvidenceCandidate, type EvidenceDecision, type EvidenceIssue, type EvidenceValidationResult } from "./evidence-contracts";
import { EvidenceValidationRegistry, issue } from "./evidence-validator";

const evidenceIdFor = async (candidate: EvidenceCandidate, payloadHash: string) => {
  const identity = `${candidate.identity.investigationId}|${candidate.identity.revision}|${candidate.identity.executionId}|${candidate.identity.source}|${candidate.identity.operation}|${candidate.schema.name}|${candidate.schema.version}|${payloadHash}`;
  return asEvidenceId(`evidence:${(await hashEvidencePayload(identity)).replace("sha256:", "")}`);
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested);
  }
  return value;
};

export class EvidenceAcceptanceService {
  constructor(private readonly validators: EvidenceValidationRegistry, private readonly now: () => string = () => new Date().toISOString()) {}

  async evaluate<TPayload>(candidate: EvidenceCandidate<TPayload>): Promise<EvidenceDecision<TPayload>> {
    let payloadHash;
    const issues: EvidenceIssue[] = [];
    try { payloadHash = await hashEvidencePayload(candidate.payload); }
    catch (error) {
      payloadHash = await hashEvidencePayload({ hashingFailure: true });
      issues.push(issue("payload-not-canonicalizable", error instanceof Error ? error.message : "Evidence payload cannot be canonicalized.", "payload"));
    }
    const validator = this.validators.resolve(candidate.schema);
    if (!validator) issues.push(issue("validator-not-registered", `No validator is registered for ${candidate.schema.name}@${candidate.schema.version}.`, "schema"));
    else issues.push(...await validator.validate(candidate as EvidenceCandidate));
    const evidenceId = await evidenceIdFor(candidate, payloadHash);
    const validation: EvidenceValidationResult = {
      status: issues.some((item) => item.severity === "error") ? "rejected" : "accepted",
      schema: candidate.schema,
      validatedAt: this.now(),
      validator: validator?.name ?? "unregistered",
      issues,
    };
    const common = {
      evidenceId,
      investigationId: candidate.identity.investigationId,
      execution: candidate.identity,
      schema: candidate.schema,
      authority: candidate.authority,
      payloadHash,
      receivedAt: candidate.receivedAt,
      provenance: candidate.provenance,
      validation,
      warnings: [...candidate.warnings],
      payload: candidate.payload,
    };
    if (validation.status === "rejected") return freeze({ status: "rejected", ...common, validation: { ...validation, status: "rejected" as const } });
    const evidence: AcceptedEvidenceEnvelope<TPayload> = freeze({
      envelopeVersion: "2.0",
      ...common,
      investigationRevision: candidate.identity.revision,
      capturedAt: candidate.capturedAt,
      freshness: candidate.freshness,
      completeness: candidate.completeness,
      validation: { ...validation, status: "accepted" },
    });
    return { status: "accepted", evidence };
  }

  async verify(envelope: AcceptedEvidenceEnvelope): Promise<boolean> {
    return await hashEvidencePayload(envelope.payload) === envelope.payloadHash;
  }
}
