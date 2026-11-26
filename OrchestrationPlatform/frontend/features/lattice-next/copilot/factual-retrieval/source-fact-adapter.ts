import type {
  EngineeringIntelligenceInvestigationV1,
  EngineeringProvenance,
  IntelligenceProperty,
  TemporalContext,
} from "../../contracts/intelligence-v1";
import type {
  FactCompletenessV1,
  FactDimensionV1,
  GenericFactV1,
  SourceCoverageStatementV1,
  FactAdapterDiagnosticV1,
  FactAdapterOmissionV1,
} from "../../contracts/factual-evidence-v1";

export type CanonicalMetricInputV1 = {
  sourceApplication: string;
  sourceEntityId: string;
  sourceNativeId?: string;
  canonicalEntityKind: string;
  nativeRecordKind?: string;
  fieldId: string;
  sourceFieldName: string;
  displayLabel: string;
  property: IntelligenceProperty;
  dimensions: readonly FactDimensionV1[];
  observedAt?: string;
  extractedAt?: string;
  freshness: TemporalContext["freshness"];
  completeness: FactCompletenessV1;
  citationIds: readonly string[];
  citationEligible: boolean;
  sourceAuthority: EngineeringProvenance["authority"];
  provenance: EngineeringProvenance;
};

export type CanonicalFactAdapterInputV1 = {
  investigation: EngineeringIntelligenceInvestigationV1;
  metrics?: readonly CanonicalMetricInputV1[];
};

export type GenericFactAdapterResultV1 = {
  facts: readonly GenericFactV1[];
  sourceCoverage: readonly SourceCoverageStatementV1[];
  diagnostics: readonly FactAdapterDiagnosticV1[];
  omissions: readonly FactAdapterOmissionV1[];
};

export interface GenericFactSourceAdapterV1 {
  adapterId: string;
  adapterVersion: string;
  sourceApplication: string;
  map(input: CanonicalFactAdapterInputV1): GenericFactAdapterResultV1;
}
