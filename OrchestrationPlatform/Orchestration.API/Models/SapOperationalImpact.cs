using Newtonsoft.Json;
namespace Orchestration.API.Models;

public sealed class SapOperationalImpactResult
{
    [JsonProperty("schemaVersion")] public string SchemaVersion { get; set; } = "1.0";
    [JsonProperty("sourceMaterialId")] public string SourceMaterialId { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "pending";
    [JsonProperty("dataSource")] public string DataSource { get; set; } = "live";
    [JsonProperty("fallback")] public SapFallbackMetadata? Fallback { get; set; }
    [JsonProperty("warningCodes")] public List<string> WarningCodes { get; set; } = new();
    [JsonProperty("currentState")] public SapBusinessImpactResult? CurrentState { get; set; }
    [JsonProperty("history")] public SapMaterialHistoryResult? History { get; set; }
    [JsonProperty("warnings")] public List<string> Warnings { get; set; } = new();
    [JsonProperty("generatedAt")] public string GeneratedAt { get; set; } = "";
}

public sealed class SapMaterialHistoryResult
{
    // New connected/fallback history contract
    [JsonProperty("requestedInput")] public string RequestedInput { get; set; } = "";
    [JsonProperty("resolutionMode")] public string ResolutionMode { get; set; } = "";
    [JsonProperty("dataSource")] public string DataSource { get; set; } = "";
    [JsonProperty("fallback")] public SapFallbackMetadata? Fallback { get; set; }
    [JsonProperty("material")] public SapHistoryMaterial Material { get; set; } = new();
    [JsonProperty("currentState")] public SapHistoryCurrentState CurrentState { get; set; } = new();
    [JsonProperty("historySummary")] public SapHistorySummary HistorySummary { get; set; } = new();
    [JsonProperty("events")] public List<SapHistoryEvent> Events { get; set; } = new();
    [JsonProperty("storageLocations")] public List<SapHistoryStorageLocation> StorageLocations { get; set; } = new();
    [JsonProperty("systemId")] public string SystemId { get; set; } = "";
    [JsonProperty("client")] public string Client { get; set; } = "";

    // Legacy history contract retained for compatibility
    [JsonProperty("requestedMaterialId")] public string RequestedMaterialId { get; set; } = "";
    [JsonProperty("materialId")] public string MaterialId { get; set; } = "";
    [JsonProperty("internalMaterialId")] public string InternalMaterialId { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "pending";
    [JsonProperty("movements")] public List<SapMaterialMovement> Movements { get; set; } = new();
    [JsonProperty("warnings")] public List<string> Warnings { get; set; } = new();
    [JsonProperty("extractedAt")] public string ExtractedAt { get; set; } = "";
}

public sealed class SapFallbackMetadata
{
    [JsonProperty("active")] public bool Active { get; set; }
    [JsonProperty("reason")] public string Reason { get; set; } = "";
    [JsonProperty("snapshotSource")] public string SnapshotSource { get; set; } = "";
    [JsonProperty("snapshotCapturedAt")] public string SnapshotCapturedAt { get; set; } = "";
    [JsonProperty("notice")] public string Notice { get; set; } = "";
}

public sealed class SapHistoryMaterial
{
    [JsonProperty("materialId")] public string MaterialId { get; set; } = "";
    [JsonProperty("internalMaterialId")] public string InternalMaterialId { get; set; } = "";
    [JsonProperty("description")] public string Description { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("storageLocation")] public string StorageLocation { get; set; } = "";
    [JsonProperty("baseUnit")] public string BaseUnit { get; set; } = "";
}

public sealed class SapHistoryCurrentState
{
    [JsonProperty("physicalStock")] public decimal? PhysicalStock { get; set; }
    [JsonProperty("valuatedQuantity")] public decimal? ValuatedQuantity { get; set; }
    [JsonProperty("inventoryValue")] public decimal? InventoryValue { get; set; }
    [JsonProperty("currency")] public string Currency { get; set; } = "";
    [JsonProperty("priceControl")] public string PriceControl { get; set; } = "";
    [JsonProperty("movingAveragePrice")] public decimal? MovingAveragePrice { get; set; }
    [JsonProperty("standardPrice")] public decimal? StandardPrice { get; set; }
    [JsonProperty("priceUnit")] public decimal? PriceUnit { get; set; }
    [JsonProperty("valuationClass")] public string ValuationClass { get; set; } = "";
}

public sealed class SapHistorySummary
{
    [JsonProperty("movementCount")] public int MovementCount { get; set; }
    [JsonProperty("accountingLineCount")] public int AccountingLineCount { get; set; }
    [JsonProperty("netQuantityDelta")] public decimal? NetQuantityDelta { get; set; }
    [JsonProperty("netInventoryValueDelta")] public decimal? NetInventoryValueDelta { get; set; }
    [JsonProperty("quantityReconciledToCurrentValuation")] public bool? QuantityReconciledToCurrentValuation { get; set; }
    [JsonProperty("valueReconciledToCurrentInventory")] public bool? ValueReconciledToCurrentInventory { get; set; }
    [JsonProperty("historicalBeforeAfterMethod")] public string HistoricalBeforeAfterMethod { get; set; } = "";
}

public sealed class SapHistoryEvent
{
    [JsonProperty("materialDocument")] public string MaterialDocument { get; set; } = "";
    [JsonProperty("documentYear")] public string DocumentYear { get; set; } = "";
    [JsonProperty("documentItem")] public string DocumentItem { get; set; } = "";
    [JsonProperty("postingDate")] public string PostingDate { get; set; } = "";
    [JsonProperty("documentDate")] public string DocumentDate { get; set; } = "";
    [JsonProperty("createdDate")] public string CreatedDate { get; set; } = "";
    [JsonProperty("createdTime")] public string CreatedTime { get; set; } = "";
    [JsonProperty("movementType")] public string MovementType { get; set; } = "";
    [JsonProperty("sourceTransaction")] public string SourceTransaction { get; set; } = "";
    [JsonProperty("quantityDelta")] public decimal? QuantityDelta { get; set; }
    [JsonProperty("unit")] public string Unit { get; set; } = "";
    [JsonProperty("inventoryValueDelta")] public decimal? InventoryValueDelta { get; set; }
    [JsonProperty("currency")] public string Currency { get; set; } = "";
    [JsonProperty("beforeQuantity")] public decimal? BeforeQuantity { get; set; }
    [JsonProperty("afterQuantity")] public decimal? AfterQuantity { get; set; }
    [JsonProperty("beforeInventoryValue")] public decimal? BeforeInventoryValue { get; set; }
    [JsonProperty("afterInventoryValue")] public decimal? AfterInventoryValue { get; set; }
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("storageLocation")] public string StorageLocation { get; set; } = "";
    [JsonProperty("productionOrder")] public string ProductionOrder { get; set; } = "";
    [JsonProperty("purchaseOrder")] public string PurchaseOrder { get; set; } = "";
    [JsonProperty("purchaseOrderItem")] public string PurchaseOrderItem { get; set; } = "";
    [JsonProperty("companyCode")] public string CompanyCode { get; set; } = "";
    [JsonProperty("fiFiscalYear")] public string FiFiscalYear { get; set; } = "";
    [JsonProperty("profitCenter")] public string ProfitCenter { get; set; } = "";
    [JsonProperty("businessArea")] public string BusinessArea { get; set; } = "";
    [JsonProperty("accountingDocuments")] public List<SapAccountingDocument> AccountingDocuments { get; set; } = new();
}

public sealed class SapHistoryStorageLocation
{
    [JsonProperty("MATNR")] public string MaterialId { get; set; } = "";
    [JsonProperty("WERKS")] public string Plant { get; set; } = "";
    [JsonProperty("LGORT")] public string StorageLocation { get; set; } = "";
    [JsonProperty("LABST")] public string Unrestricted { get; set; } = "";
    [JsonProperty("INSME")] public string QualityInspection { get; set; } = "";
    [JsonProperty("EINME")] public string RestrictedUse { get; set; } = "";
    [JsonProperty("SPEME")] public string Blocked { get; set; } = "";
    [JsonProperty("UMLME")] public string InTransfer { get; set; } = "";
    [JsonProperty("RETME")] public string Returns { get; set; } = "";
}

public sealed class SapMaterialMovement
{
    [JsonProperty("materialDocument")] public string MaterialDocument { get; set; } = "";
    [JsonProperty("materialDocumentYear")] public string MaterialDocumentYear { get; set; } = "";
    [JsonProperty("item")] public string Item { get; set; } = "";
    [JsonProperty("movementType")] public string MovementType { get; set; } = "";
    [JsonProperty("movementDescription")] public string MovementDescription { get; set; } = "";
    [JsonProperty("direction")] public string Direction { get; set; } = "";
    [JsonProperty("quantity")] public decimal? Quantity { get; set; }
    [JsonProperty("signedQuantity")] public decimal? SignedQuantity { get; set; }
    [JsonProperty("unit")] public string Unit { get; set; } = "";
    [JsonProperty("localAmount")] public decimal? LocalAmount { get; set; }
    [JsonProperty("signedLocalAmount")] public decimal? SignedLocalAmount { get; set; }
    [JsonProperty("currency")] public string Currency { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("storageLocation")] public string StorageLocation { get; set; } = "";
    [JsonProperty("productionOrder")] public string ProductionOrder { get; set; } = "";
    [JsonProperty("businessArea")] public string BusinessArea { get; set; } = "";
    [JsonProperty("profitCenter")] public string ProfitCenter { get; set; } = "";
    [JsonProperty("materialItemGlAccount")] public string MaterialItemGlAccount { get; set; } = "";
    [JsonProperty("postingDate")] public string PostingDate { get; set; } = "";
    [JsonProperty("documentDate")] public string DocumentDate { get; set; } = "";
    [JsonProperty("createdDate")] public string CreatedDate { get; set; } = "";
    [JsonProperty("createdTime")] public string CreatedTime { get; set; } = "";
    [JsonProperty("sourceTransaction")] public string SourceTransaction { get; set; } = "";
    [JsonProperty("accountingDocument")] public SapAccountingDocument AccountingDocument { get; set; } = new();
    [JsonProperty("controllingReference")] public SapDocumentReference ControllingReference { get; set; } = new();
    [JsonProperty("materialLedgerReference")] public SapDocumentReference MaterialLedgerReference { get; set; } = new();
    [JsonProperty("evidenceConfidence")] public string EvidenceConfidence { get; set; } = "confirmed";
}

public sealed class SapAccountingDocument
{
    [JsonProperty("availability")] public string Availability { get; set; } = "not-found";
    [JsonProperty("companyCode")] public string CompanyCode { get; set; } = "";
    [JsonProperty("documentNumber")] public string DocumentNumber { get; set; } = "";
    [JsonProperty("accountingDocument")] public string AccountingDocument { get; set; } = "";
    [JsonProperty("fiscalYear")] public string FiscalYear { get; set; } = "";
    [JsonProperty("postingPeriod")] public string PostingPeriod { get; set; } = "";
    [JsonProperty("currency")] public string Currency { get; set; } = "";
    [JsonProperty("postingDate")] public string PostingDate { get; set; } = "";
    [JsonProperty("documentType")] public string DocumentType { get; set; } = "";
    [JsonProperty("ledger")] public string Ledger { get; set; } = "";
    [JsonProperty("lines")] public List<SapAccountingLine> Lines { get; set; } = new();
}

public sealed class SapAccountingLine
{
    [JsonProperty("lineItem")] public string LineItem { get; set; } = "";
    [JsonProperty("line")] public string Line { get; set; } = "";
    [JsonProperty("glAccount")] public string GlAccount { get; set; } = "";
    [JsonProperty("direction")] public string Direction { get; set; } = "";
    [JsonProperty("debitCredit")] public string DebitCredit { get; set; } = "";
    [JsonProperty("signedAmount")] public decimal? SignedAmount { get; set; }
    [JsonProperty("amount")] public decimal? Amount { get; set; }
    [JsonProperty("currency")] public string Currency { get; set; } = "";
    [JsonProperty("quantity")] public decimal? Quantity { get; set; }
    [JsonProperty("unit")] public string Unit { get; set; } = "";
    [JsonProperty("text")] public string Text { get; set; } = "";
    [JsonProperty("accountName")] public string AccountName { get; set; } = "";
    [JsonProperty("businessArea")] public string BusinessArea { get; set; } = "";
    [JsonProperty("profitCenter")] public string ProfitCenter { get; set; } = "";
    [JsonProperty("productionOrder")] public string ProductionOrder { get; set; } = "";
}

public sealed class SapDocumentReference
{
    [JsonProperty("availability")] public string Availability { get; set; } = "not-found";
    [JsonProperty("reference")] public string Reference { get; set; } = "";
    [JsonProperty("fiscalYear")] public string FiscalYear { get; set; } = "";
    [JsonProperty("detailsVerified")] public bool DetailsVerified { get; set; }
}
