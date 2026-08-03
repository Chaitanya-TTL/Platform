using Newtonsoft.Json;
using System.Text.Json.Serialization;
namespace Orchestration.API.Models;
public sealed class SapCapabilityReport
{
    [JsonProperty("materialId")] [JsonPropertyName("materialId")] public string MaterialId { get; set; } = "";
    [JsonProperty("plant")] [JsonPropertyName("plant")] public string Plant { get; set; } = "";
    [JsonProperty("systemId")] [JsonPropertyName("systemId")] public string SystemId { get; set; } = "";
    [JsonProperty("client")] [JsonPropertyName("client")] public string Client { get; set; } = "";
    [JsonProperty("generatedAt")] [JsonPropertyName("generatedAt")] public string GeneratedAt { get; set; } = "";
    [JsonProperty("capabilities")] [JsonPropertyName("capabilities")] public List<SapCapabilityCheck> Capabilities { get; set; } = new();
    [JsonProperty("warnings")] [JsonPropertyName("warnings")] public List<string> Warnings { get; set; } = new();
}
public sealed class SapCapabilityCheck
{
    [JsonProperty("function")] [JsonPropertyName("function")] public string Function { get; set; } = "";
    [JsonProperty("purpose")] [JsonPropertyName("purpose")] public string Purpose { get; set; } = "";
    [JsonProperty("available")] [JsonPropertyName("available")] public bool Available { get; set; }
    [JsonProperty("authorized")] [JsonPropertyName("authorized")] public bool? Authorized { get; set; }
    [JsonProperty("imports")] [JsonPropertyName("imports")] public List<string> Imports { get; set; } = new();
    [JsonProperty("exports")] [JsonPropertyName("exports")] public List<string> Exports { get; set; } = new();
    [JsonProperty("tables")] [JsonPropertyName("tables")] public List<string> Tables { get; set; } = new();
    [JsonProperty("structures")] [JsonPropertyName("structures")] public List<string> Structures { get; set; } = new();
    [JsonProperty("message")] [JsonPropertyName("message")] public string? Message { get; set; }
}
