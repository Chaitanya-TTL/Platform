using System.Text.Json.Serialization;

namespace ConfigitAceIntegration.Dtos;

public record PartAssignExpressionDto(
    [property: JsonPropertyName("ExpressionAssignableID")] string ExpressionAssignableID,
    [property: JsonPropertyName("Definition")] string? Definition,
    [property: JsonPropertyName("DetailItems")] IReadOnlyCollection<DetailItemDto> DetailItems = null!);

public record DetailItemDto(
    [property: JsonPropertyName("Expression")] string Expression, 
    [property: JsonPropertyName("Description")] string Description);

public record PartUseDto(double Quantity = 1.0);

public record BomStructureDto(
    [property: JsonPropertyName("PartId")] string PartId,
    [property: JsonPropertyName("PartName")] string PartName,
    [property: JsonPropertyName("PartNumber")] string PartNumber,
    [property: JsonPropertyName("Components")] IReadOnlyCollection<BomStructureDto>? Components,
    [property: JsonPropertyName("Expressions")] PartAssignExpressionDto? Expressions,
    [property: JsonPropertyName("PartUse")] PartUseDto? PartUse);
