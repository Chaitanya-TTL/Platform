import type { RetrievalDiagnostics } from "../contracts";

export interface RetrievalDiagnosticsStore {
  persist(diagnostics: RetrievalDiagnostics): Promise<void>;
}
