using Newtonsoft.Json;

namespace Orchestration.API.Models
{
    public class PipelineRequest
    {
        [JsonProperty("teamcenterItemId")]
        public string TeamcenterItemId { get; set; }

        [JsonProperty("pipelinePath")]
        public string? PipelinePath { get; set; } // Optional - uses default if not provided
    }
}
