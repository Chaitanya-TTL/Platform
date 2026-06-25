using System.Collections.Generic;
using Newtonsoft.Json;

namespace Orchestration.API.Models
{
    public class BomNode
    {
        [JsonProperty("itemId")]
        public string ItemId { get; set; }

        [JsonProperty("sequence")]
        public string Sequence { get; set; }

        [JsonProperty("variantState")]
        public string VariantState { get; set; }

        [JsonProperty("revId")]
        public string RevId { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("qty")]
        public string Qty { get; set; }

        [JsonProperty("variantCondition")]
        public string VariantCondition { get; set; }

        [JsonProperty("children")]
        public List<BomNode> Children { get; set; } = new();
    }

    public class BomRoot
    {
        [JsonProperty("bomRoot")]
        public BomNode BomRootNode { get; set; }

        [JsonProperty("sourceItemId")]
        public string SourceItemId { get; set; }

        [JsonProperty("sourceRevId")]
        public string SourceRevId { get; set; }

        [JsonProperty("variantOptions")]
        public Dictionary<string, List<string>> VariantOptions { get; set; } = new();

        [JsonProperty("extractedAt")]
        public string ExtractedAt { get; set; }
    }
}
