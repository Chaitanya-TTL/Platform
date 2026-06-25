using Newtonsoft.Json;

namespace Orchestration.API.Models
{
    public class PipelineProgress
    {
        [JsonProperty("jobId")]
        public string JobId { get; set; }

        [JsonProperty("phase")]
        public string Phase { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // "in_progress", "complete", "error"

        [JsonProperty("progressPercent")]
        public int ProgressPercent { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("bomStructure")]
        public BomRoot BomStructure { get; set; }

        [JsonProperty("error")]
        public string Error { get; set; }

        [JsonProperty("timestamp")]
        public string Timestamp { get; set; }
    }
}
