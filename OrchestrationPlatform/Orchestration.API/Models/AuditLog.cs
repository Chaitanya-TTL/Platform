
using Newtonsoft.Json;
namespace Orchestration.API.Models;
public class AuditLog
{
    [JsonProperty("jobId")] public string JobId { get; set; } = "";
    [JsonProperty("teamcenterItemId")] public string TeamcenterItemId { get; set; } = "";
    [JsonProperty("startTime")] public DateTime StartTime { get; set; }
    [JsonProperty("endTime")] public DateTime? EndTime { get; set; }
    [JsonProperty("status")] public string Status { get; set; } = "";
    [JsonProperty("phases")] public List<PhaseLog> Phases { get; set; } = new();
    [JsonProperty("finalBom")] public BomRoot? FinalBom { get; set; }
    [JsonProperty("sapBusinessImpact")] public SapBusinessImpactResult? SapBusinessImpact { get; set; }
    [JsonProperty("sapOperationalImpact")] public SapOperationalImpactResult? SapOperationalImpact { get; set; }
    [JsonProperty("error")] public string? Error { get; set; }
    [JsonProperty("outputFilePath")] public string? OutputFilePath { get; set; }
    [JsonProperty("sapImpactOutputFilePath")] public string? SapImpactOutputFilePath { get; set; }
    [JsonProperty("sapHistoryOutputFilePath")] public string? SapHistoryOutputFilePath { get; set; }
    [JsonProperty("outputKind")] public string? OutputKind { get; set; }
}
public class PhaseLog
{
    [JsonProperty("phase")] public string Phase { get; set; } = "";
    [JsonProperty("status")] public string Status { get; set; } = "";
    [JsonProperty("startTime")] public DateTime StartTime { get; set; }
    [JsonProperty("endTime")] public DateTime? EndTime { get; set; }
    [JsonProperty("progressPercent")] public int ProgressPercent { get; set; }
    [JsonProperty("message")] public string? Message { get; set; }
}
