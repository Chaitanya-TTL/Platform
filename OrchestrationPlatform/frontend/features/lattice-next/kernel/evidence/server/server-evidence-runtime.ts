import { FileEvidenceArtifactStore } from "../storage/file-evidence-artifact-store";
import { FileEvidenceRepository } from "../storage/file-evidence-repository";
const shared=globalThis as typeof globalThis&{__latticeEvidenceRepository?:FileEvidenceRepository;__latticeEvidenceArtifacts?:FileEvidenceArtifactStore};
export const serverEvidenceRepository=shared.__latticeEvidenceRepository??=new FileEvidenceRepository();
export const serverEvidenceArtifacts=shared.__latticeEvidenceArtifacts??=new FileEvidenceArtifactStore();
