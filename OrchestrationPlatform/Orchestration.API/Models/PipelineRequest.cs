using Newtonsoft.Json;
using System.Text.Json.Serialization;

namespace Orchestration.API.Models
{
    public enum ExtractionKind
    {
        Teamcenter,
        Configit
    }

    public class ExtractionRequest
    {
        [JsonProperty("kind")]
        [JsonPropertyName("kind")]
        public ExtractionKind Kind { get; set; } = ExtractionKind.Teamcenter;

        [JsonProperty("jobId")]
        [JsonPropertyName("jobId")]
        public string? JobId { get; set; }

        [JsonProperty("teamcenterItemId")]
        [JsonPropertyName("teamcenterItemId")]
        public string? TeamcenterItemId { get; set; }

        [JsonProperty("workItemId")]
        [JsonPropertyName("workItemId")]
        public string? WorkItemId { get; set; }

        [JsonProperty("productModelCode")]
        [JsonPropertyName("productModelCode")]
        public string? ProductModelCode { get; set; }

        [JsonProperty("pipelinePath")]
        [JsonPropertyName("pipelinePath")]
        public string? PipelinePath { get; set; }

        public string? GetIdentifier() => !string.IsNullOrWhiteSpace(TeamcenterItemId)
            ? TeamcenterItemId
            : !string.IsNullOrWhiteSpace(WorkItemId)
                ? WorkItemId
                : null;
    }
}
