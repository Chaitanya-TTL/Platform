using System.Text.Json.Serialization;

namespace ConfigitAceIntegration.Models;

public record TcExtractionDto(
    [property: JsonPropertyName("bomRoot")] TcBomNode BomRoot,
    [property: JsonPropertyName("sourceRevId")] string SourceRevId,
    [property: JsonPropertyName("variantOptions")] Dictionary<string, string[]> VariantOptions,
    [property: JsonPropertyName("sourceItemId")] string SourceItemId,
    [property: JsonPropertyName("extractedAt")] string ExtractedAt);

public record TcBomNode(
    [property: JsonPropertyName("itemId")] string ItemId,
    [property: JsonPropertyName("sequence")] string Sequence,
    [property: JsonPropertyName("variantState")] string VariantState,
    [property: JsonPropertyName("children")] TcBomNode[]? Children,
    [property: JsonPropertyName("qty")] string? Qty,
    [property: JsonPropertyName("revId")] string RevId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("variantCondition")] string? VariantCondition);
