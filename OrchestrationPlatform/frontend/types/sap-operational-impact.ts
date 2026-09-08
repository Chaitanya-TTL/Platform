import type { SapBusinessImpact } from "@/lib/api";

export type SapOperationalDataSource = "live" | "fallback-snapshot" | string;

export interface SapFallbackMetadata {
  active: boolean;
  reason?: string;
  snapshotSource?: string;
  snapshotCapturedAt?: string;
  notice?: string;
}

export interface SapHistoryMaterial {
  materialId?: string;
  internalMaterialId?: string;
  description?: string;
  plant?: string;
  storageLocation?: string;
  baseUnit?: string;
}

export interface SapHistoryCurrentState {
  physicalStock?: number | null;
  valuatedQuantity?: number | null;
  inventoryValue?: number | null;
  currency?: string;
  priceControl?: string;
  movingAveragePrice?: number | null;
  standardPrice?: number | null;
  priceUnit?: number | null;
  valuationClass?: string;
}

export interface SapHistorySummary {
  movementCount?: number | null;
  accountingLineCount?: number | null;
  netQuantityDelta?: number | null;
  netInventoryValueDelta?: number | null;
  quantityReconciledToCurrentValuation?: boolean | null;
  valueReconciledToCurrentInventory?: boolean | null;
  historicalBeforeAfterMethod?: string;
}

export interface SapHistoryAccountingLine {
  line?: string;
  lineItem?: string;
  glAccount?: string;
  debitCredit?: string;
  direction?: string;
  amount?: number | null;
  signedAmount?: number | null;
  currency?: string;
  quantity?: number | null;
  unit?: string;
  productionOrder?: string;
  profitCenter?: string;
  businessArea?: string;
}

export interface SapHistoryAccountingDocument {
  companyCode?: string;
  accountingDocument?: string;
  documentNumber?: string;
  fiscalYear?: string;
  documentType?: string;
  postingDate?: string;
  ledger?: string;
  lines?: SapHistoryAccountingLine[] | null;
}

export interface SapHistoryEvent {
  materialDocument?: string;
  documentYear?: string;
  documentItem?: string;
  postingDate?: string;
  documentDate?: string;
  createdDate?: string;
  createdTime?: string;
  movementType?: string;
  sourceTransaction?: string;
  quantityDelta?: number | null;
  unit?: string;
  inventoryValueDelta?: number | null;
  currency?: string;
  beforeQuantity?: number | null;
  afterQuantity?: number | null;
  beforeInventoryValue?: number | null;
  afterInventoryValue?: number | null;
  plant?: string;
  storageLocation?: string;
  productionOrder?: string;
  purchaseOrder?: string;
  purchaseOrderItem?: string;
  companyCode?: string;
  fiFiscalYear?: string;
  profitCenter?: string;
  businessArea?: string;
  accountingDocuments?: SapHistoryAccountingDocument[] | null;
  accountingDocument?: SapHistoryAccountingDocument | null;
}

export interface SapStorageLocation {
  MATNR?: string;
  WERKS?: string;
  LGORT?: string;
  LABST?: string;
  INSME?: string;
  EINME?: string;
  SPEME?: string;
  UMLME?: string;
  RETME?: string;
}

export interface SapMaterialHistory {
  requestedInput?: string;
  resolutionMode?: string;
  dataSource?: SapOperationalDataSource;
  fallback?: SapFallbackMetadata | null;
  material?: SapHistoryMaterial | null;
  currentState?: SapHistoryCurrentState | null;
  historySummary?: SapHistorySummary | null;
  events?: SapHistoryEvent[] | null;
  movements?: SapHistoryEvent[] | null;
  storageLocations?: SapStorageLocation[] | null;
  warnings?: string[] | null;
  systemId?: string;
  client?: string;
  extractedAt?: string;
}

export interface SapOperationalImpact {
  status?: string;
  warningCodes?: string[] | null;
  sourceMaterialId?: string;
  plant?: string;
  impact?: SapBusinessImpact | null;
  history?: SapMaterialHistory | null;
  warnings?: string[] | null;
  extractedAt?: string;
  dataSource?: SapOperationalDataSource;
  fallback?: SapFallbackMetadata | null;
}
