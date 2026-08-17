using Newtonsoft.Json;
namespace Orchestration.API.Models;

public sealed class SapOperationalImpactResult
{
    [JsonProperty("schemaVersion")] public string SchemaVersion { get; set; } = "1.0";
    [JsonProperty("sourceMaterialId")] public string SourceMaterialId { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "pending";
    [JsonProperty("currentState")] public SapBusinessImpactResult? CurrentState { get; set; }
    [JsonProperty("history")] public SapMaterialHistoryResult? History { get; set; }
    [JsonProperty("warnings")] public List<string> Warnings { get; set; } = new();
    [JsonProperty("generatedAt")] public string GeneratedAt { get; set; } = "";
}
public sealed class SapMaterialHistoryResult
{
    [JsonProperty("requestedMaterialId")] public string RequestedMaterialId { get; set; } = "";
    [JsonProperty("materialId")] public string MaterialId { get; set; } = "";
    [JsonProperty("internalMaterialId")] public string InternalMaterialId { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "pending";
    [JsonProperty("movements")] public List<SapMaterialMovement> Movements { get; set; } = new();
    [JsonProperty("warnings")] public List<string> Warnings { get; set; } = new();
    [JsonProperty("extractedAt")] public string ExtractedAt { get; set; } = "";
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
    [JsonProperty("fiscalYear")] public string FiscalYear { get; set; } = "";
    [JsonProperty("postingPeriod")] public string PostingPeriod { get; set; } = "";
    [JsonProperty("currency")] public string Currency { get; set; } = "";
    [JsonProperty("postingDate")] public string PostingDate { get; set; } = "";
    [JsonProperty("lines")] public List<SapAccountingLine> Lines { get; set; } = new();
}
public sealed class SapAccountingLine
{
    [JsonProperty("lineItem")] public string LineItem { get; set; } = "";
    [JsonProperty("glAccount")] public string GlAccount { get; set; } = "";
    [JsonProperty("direction")] public string Direction { get; set; } = "";
    [JsonProperty("signedAmount")] public decimal? SignedAmount { get; set; }
    [JsonProperty("currency")] public string Currency { get; set; } = "";
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
