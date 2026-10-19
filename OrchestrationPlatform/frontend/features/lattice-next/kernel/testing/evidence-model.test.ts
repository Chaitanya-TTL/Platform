import assert from "node:assert/strict";
import test from "node:test";
import { asCorrelationId, asExecutionId, asInvestigationId } from "../contracts/investigation-identity";
import { BasicEvidenceValidator } from "../evidence/default-evidence-validator";
import { EvidenceAcceptanceService } from "../evidence/evidence-acceptance-service";
import { hashEvidencePayload } from "../evidence/evidence-hasher";
import { EvidenceValidationRegistry } from "../evidence/evidence-validator";
import type { EvidenceCandidate } from "../evidence/evidence-contracts";

const schema = { name: "engineering-intelligence", version: "1.0" } as const;
const identity = {
  investigationId: asInvestigationId("investigation-1"), revision: 1, executionEpoch: 1,
  executionId: asExecutionId("execution-1"), correlationId: asCorrelationId("correlation-1"),
  source: "windchill", operation: "gather-intelligence" as const, attempt: 1,
};
const candidate = (payload: unknown = { b: 2, a: 1 }): EvidenceCandidate => ({
  identity, schema, authority: "source-authoritative", freshness: "current", completeness: "complete",
  capturedAt: "2026-10-13T00:00:00.000Z", receivedAt: "2026-10-13T00:00:01.000Z",
  provenance: { provider: "test", observedAt: "2026-10-13T00:00:00.000Z", sourceRecord: { source: "windchill", nativeId: "WTPart-1" } },
  payload, warnings: [],
});
const service = () => {
  const registry = new EvidenceValidationRegistry();
  registry.register(new BasicEvidenceValidator(schema));
  return new EvidenceAcceptanceService(registry, () => "2026-10-13T00:00:02.000Z");
};

test("stable hashing ignores object key order", async () => {
  assert.equal(await hashEvidencePayload({ a: 1, b: 2 }), await hashEvidencePayload({ b: 2, a: 1 }));
});
test("accepted evidence has deterministic identity, hash and immutable payload", async () => {
  const first = await service().evaluate(candidate());
  const second = await service().evaluate(candidate());
  assert.equal(first.status, "accepted"); assert.equal(second.status, "accepted");
  if (first.status !== "accepted" || second.status !== "accepted") return;
  assert.equal(first.evidence.evidenceId, second.evidence.evidenceId);
  assert.equal(first.evidence.payloadHash, second.evidence.payloadHash);
  assert.equal(first.evidence.investigationRevision, 1);
  assert.equal(Object.isFrozen(first.evidence), true);
  assert.equal(Object.isFrozen(first.evidence.payload), true);
});
test("unregistered schemas are rejected", async () => {
  const result = await new EvidenceAcceptanceService(new EvidenceValidationRegistry()).evaluate(candidate());
  assert.equal(result.status, "rejected");
  assert.equal(result.validation.issues.some((item) => item.code === "validator-not-registered"), true);
});
test("unavailable authority cannot claim complete evidence", async () => {
  const value = { ...candidate(), authority: "unavailable" as const, completeness: "complete" as const };
  const result = await service().evaluate(value);
  assert.equal(result.status, "rejected");
});
