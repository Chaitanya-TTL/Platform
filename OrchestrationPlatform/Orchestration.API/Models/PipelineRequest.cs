using Newtonsoft.Json;
using System.Text.Json.Serialization;
namespace Orchestration.API.Models;
public enum ExtractionKind { Teamcenter, Configit, Sap }
public class ExtractionRequest
{
    [JsonProperty("kind")][JsonPropertyName("kind")] public ExtractionKind Kind { get; set; } = ExtractionKind.Teamcenter;
    [JsonProperty("jobId")][JsonPropertyName("jobId")] public string? JobId { get; set; }
    [JsonProperty("teamcenterItemId")][JsonPropertyName("teamcenterItemId")] public string? TeamcenterItemId { get; set; }
    [JsonProperty("workItemId")][JsonPropertyName("workItemId")] public string? WorkItemId { get; set; }
    [JsonProperty("productModelCode")][JsonPropertyName("productModelCode")] public string? ProductModelCode { get; set; }
    [JsonProperty("materialId")][JsonPropertyName("materialId")] public string? MaterialId { get; set; }
    [JsonProperty("plant")][JsonPropertyName("plant")] public string? Plant { get; set; }
    [JsonProperty("bomUsage")][JsonPropertyName("bomUsage")] public string? BomUsage { get; set; }
    [JsonProperty("alternative")][JsonPropertyName("alternative")] public string? Alternative { get; set; }
    [JsonProperty("includeSapBusinessImpact")][JsonPropertyName("includeSapBusinessImpact")] public bool IncludeSapBusinessImpact { get; set; } = true;
    [JsonProperty("pipelinePath")][JsonPropertyName("pipelinePath")] public string? PipelinePath { get; set; }
    public string? GetIdentifier()=>!string.IsNullOrWhiteSpace(TeamcenterItemId)?TeamcenterItemId:!string.IsNullOrWhiteSpace(MaterialId)?MaterialId:!string.IsNullOrWhiteSpace(WorkItemId)?WorkItemId:null;
}
