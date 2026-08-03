using System.Text.Json.Serialization;
namespace Orchestration.API.Models;
public sealed class SapMaterialCatalogRequest
{
    public string? MaterialPrefix { get; set; }
    public int MaxRows { get; set; } = 0;
}
public sealed class SapMaterialCatalogResult
{
    [JsonPropertyName("systemId")] public string SystemId { get; set; } = "";
    [JsonPropertyName("client")] public string Client { get; set; } = "";
    [JsonPropertyName("generatedAt")] public string GeneratedAt { get; set; } = "";
    [JsonPropertyName("status")] public string Status { get; set; } = "";
    [JsonPropertyName("rawRowsReturned")] public int RawRowsReturned { get; set; }
    [JsonPropertyName("totalMaterials")] public int TotalMaterials { get; set; }
    [JsonPropertyName("warnings")] public List<string> Warnings { get; set; } = new();
}
