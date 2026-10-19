import type { EvidenceCandidate, EvidenceIssue, EvidenceSchemaIdentity } from "./evidence-contracts";

export interface EvidenceValidator<TPayload = unknown> {
  readonly schema: EvidenceSchemaIdentity;
  readonly name: string;
  validate(candidate: EvidenceCandidate<TPayload>): readonly EvidenceIssue[] | Promise<readonly EvidenceIssue[]>;
}

export class EvidenceValidationRegistry {
  private readonly validators = new Map<string, EvidenceValidator>();
  register(validator: EvidenceValidator): void {
    const key = this.key(validator.schema);
    if (this.validators.has(key)) throw new Error(`Evidence validator already registered for ${key}.`);
    this.validators.set(key, validator);
  }
  resolve(schema: EvidenceSchemaIdentity): EvidenceValidator | undefined {
    return this.validators.get(this.key(schema));
  }
  private key(schema: EvidenceSchemaIdentity): string { return `${schema.name}@${schema.version}`; }
}

export const issue = (code: string, message: string, path?: string, severity: EvidenceIssue["severity"] = "error"): EvidenceIssue => ({
  code, message, path, severity,
});
