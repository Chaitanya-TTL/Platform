using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Orchestration.API.Models
{
    public class AuditLog
    {
        [JsonProperty("jobId")]
        public string JobId { get; set; }

        [JsonProperty("teamcenterItemId")]
        public string TeamcenterItemId { get; set; }

        [JsonProperty("startTime")]
        public DateTime StartTime { get; set; }

        [JsonProperty("endTime")]
        public DateTime? EndTime { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; } // "success", "failed", "in_progress"

        [JsonProperty("phases")]
        public List<PhaseLog> Phases { get; set; } = new();

        [JsonProperty("finalBom")]
        public BomRoot FinalBom { get; set; }

        [JsonProperty("error")]
        public string Error { get; set; }
    }

    public class PhaseLog
    {
        [JsonProperty("phase")]
        public string Phase { get; set; }

        [JsonProperty("status")]
        public string Status { get; set; }

        [JsonProperty("startTime")]
        public DateTime StartTime { get; set; }

        [JsonProperty("endTime")]
        public DateTime? EndTime { get; set; }

        [JsonProperty("progressPercent")]
        public int ProgressPercent { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
    }
}
