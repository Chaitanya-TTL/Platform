using Newtonsoft.Json;
using System.Text.Json.Serialization;
namespace Orchestration.API.Models;
public sealed class SapExecutionValidationReport
{
    [JsonProperty("materialId")] [JsonPropertyName("materialId")] public string MaterialId { get; set; } = "";
    [JsonProperty("plant")] [JsonPropertyName("plant")] public string Plant { get; set; } = "";
    [JsonProperty("systemId")] [JsonPropertyName("systemId")] public string SystemId { get; set; } = "";
    [JsonProperty("client")] [JsonPropertyName("client")] public string Client { get; set; } = "";
    [JsonProperty("generatedAt")] [JsonPropertyName("generatedAt")] public string GeneratedAt { get; set; } = "";
    [JsonProperty("executions")] [JsonPropertyName("executions")] public List<SapFunctionExecutionResult> Executions { get; set; } = new();
    [JsonProperty("notes")] [JsonPropertyName("notes")] public List<string> Notes { get; set; } = new();
}
public sealed class SapFunctionExecutionResult
{
    [JsonProperty("function")] [JsonPropertyName("function")] public string Function { get; set; } = "";
    [JsonProperty("available")] [JsonPropertyName("available")] public bool Available { get; set; }
    [JsonProperty("executed")] [JsonPropertyName("executed")] public bool Executed { get; set; }
    [JsonProperty("durationMs")] [JsonPropertyName("durationMs")] public long DurationMs { get; set; }
    [JsonProperty("message")] [JsonPropertyName("message")] public string Message { get; set; } = "";
    [JsonProperty("exports")] [JsonPropertyName("exports")] public System.Text.Json.JsonElement Exports { get; set; }
    [JsonProperty("tables")] [JsonPropertyName("tables")] public System.Text.Json.JsonElement Tables { get; set; }
}
