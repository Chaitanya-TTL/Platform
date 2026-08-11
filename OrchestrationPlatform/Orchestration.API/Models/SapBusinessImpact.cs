using Newtonsoft.Json;
namespace Orchestration.API.Models;
public sealed class SapBusinessImpactResult
{
    [JsonProperty("sourceMaterialId")] public string SourceMaterialId { get; set; } = "";
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "pending";
    [JsonProperty("materials")] public List<SapMaterialImpact> Materials { get; set; } = new();
    [JsonProperty("warnings")] public List<string> Warnings { get; set; } = new();
    [JsonProperty("extractedAt")] public string ExtractedAt { get; set; } = "";
}
public sealed class SapMaterialImpact
{
    [JsonProperty("materialId")] public string MaterialId { get; set; } = "";
    [JsonProperty("internalMaterialId")] public string InternalMaterialId { get; set; } = "";
    [JsonProperty("requestedMaterialId")] public string RequestedMaterialId { get; set; } = "";
    [JsonProperty("description")] public string Description { get; set; } = "";
    [JsonProperty("materialType")] public string MaterialType { get; set; } = "";
    [JsonProperty("baseUnit")] public string BaseUnit { get; set; } = "";
    [JsonProperty("batchManaged")] public bool? BatchManaged { get; set; }
    [JsonProperty("crossPlantStatus")] public string CrossPlantStatus { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "";
    [JsonProperty("organization")] public SapOrganizationImpact Organization { get; set; } = new();
    [JsonProperty("stock")] public SapStockImpact Stock { get; set; } = new();
    [JsonProperty("inventory")] public SapInventoryImpact Inventory { get; set; } = new();
    [JsonProperty("cost")] public SapCostImpact Cost { get; set; } = new();
    [JsonProperty("checks")] public SapValuationChecks Checks { get; set; } = new();
    [JsonProperty("storageLocations")] public List<SapStorageLocationImpact> StorageLocations { get; set; } = new();
    [JsonProperty("warnings")] public List<string> Warnings { get; set; } = new();
    [JsonProperty("extractedAt")] public string ExtractedAt { get; set; } = "";
}
public sealed class SapOrganizationImpact
{
    [JsonProperty("plant")] public string Plant { get; set; } = "";
    [JsonProperty("valuationArea")] public string ValuationArea { get; set; } = "";
    [JsonProperty("companyCode")] public string CompanyCode { get; set; } = "";
    [JsonProperty("currency")] public string Currency { get; set; } = "";
}
public sealed class SapStockImpact
{
    [JsonProperty("unrestricted")] public decimal? Unrestricted { get; set; }
    [JsonProperty("qualityInspection")] public decimal? QualityInspection { get; set; }
    [JsonProperty("restrictedUse")] public decimal? RestrictedUse { get; set; }
    [JsonProperty("blocked")] public decimal? Blocked { get; set; }
    [JsonProperty("inTransfer")] public decimal? InTransfer { get; set; }
    [JsonProperty("returns")] public decimal? Returns { get; set; }
    [JsonProperty("totalPhysical")] public decimal? TotalPhysical { get; set; }
    [JsonProperty("atpAvailable")] public decimal? AtpAvailable { get; set; }
}
public sealed class SapInventoryImpact
{
    [JsonProperty("valuatedQuantity")] public decimal? ValuatedQuantity { get; set; }
    [JsonProperty("totalStockValue")] public decimal? TotalStockValue { get; set; }
    [JsonProperty("valuationType")] public string ValuationType { get; set; } = "";
}
public sealed class SapCostImpact
{
    [JsonProperty("priceControl")] public string PriceControl { get; set; } = "";
    [JsonProperty("standardPrice")] public decimal? StandardPrice { get; set; }
    [JsonProperty("movingAveragePrice")] public decimal? MovingAveragePrice { get; set; }
    [JsonProperty("priceUnit")] public decimal? PriceUnit { get; set; }
    [JsonProperty("effectiveUnitCost")] public decimal? EffectiveUnitCost { get; set; }
    [JsonProperty("valuationClass")] public string ValuationClass { get; set; } = "";
}
public sealed class SapValuationChecks
{
    [JsonProperty("calculatedInventoryValue")] public decimal? CalculatedInventoryValue { get; set; }
    [JsonProperty("reportedInventoryValue")] public decimal? ReportedInventoryValue { get; set; }
    [JsonProperty("valuationReconciled")] public bool? ValuationReconciled { get; set; }
}
public sealed class SapStorageLocationImpact
{
    [JsonProperty("storageLocation")] public string StorageLocation { get; set; } = "";
    [JsonProperty("unrestricted")] public decimal? Unrestricted { get; set; }
    [JsonProperty("qualityInspection")] public decimal? QualityInspection { get; set; }
    [JsonProperty("restrictedUse")] public decimal? RestrictedUse { get; set; }
    [JsonProperty("blocked")] public decimal? Blocked { get; set; }
    [JsonProperty("inTransfer")] public decimal? InTransfer { get; set; }
    [JsonProperty("returns")] public decimal? Returns { get; set; }
}
