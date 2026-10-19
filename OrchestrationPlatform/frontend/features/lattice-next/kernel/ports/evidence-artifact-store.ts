export interface EvidenceArtifact {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}
export interface EvidenceArtifactStore {
  put(artifact: EvidenceArtifact): Promise<"created" | "existing">;
  get(artifactId: string): Promise<EvidenceArtifact | undefined>;
}
