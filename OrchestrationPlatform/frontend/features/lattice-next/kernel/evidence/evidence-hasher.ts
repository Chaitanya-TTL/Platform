import { asEvidencePayloadHash, type EvidencePayloadHash } from "./evidence-contracts";
import { stableJson } from "./stable-json";

export async function hashEvidencePayload(payload: unknown): Promise<EvidencePayloadHash> {
  const bytes = new TextEncoder().encode(stableJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return asEvidencePayloadHash(`sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`);
}
