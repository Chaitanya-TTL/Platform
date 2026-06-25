using System.Text.Json;
using ConfigitAceIntegration.Abstractions;
using ConfigitAceIntegration.Application.Builders;
using ConfigitAceIntegration.Dtos;
using ConfigitAceIntegration.Models;
using ConfigitAceIntegration.Transformers;
using Microsoft.Extensions.Logging;

namespace ConfigitAceIntegration.Application;

/// <summary>
/// Transformation service orchestrating the conversion from Teamcenter JSON to Configit BOM structure.
/// Handles parsing, recursive BOM transformation, expression building, and name extraction.
/// </summary>
public class TransformationService : ITransformationService
{
    private readonly ILogger<TransformationService> _logger;

    public TransformationService(ILogger<TransformationService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Parses raw JSON string to Teamcenter extraction DTO.
    /// </summary>
    public TcExtractionDto ParseExtraction(string jsonContent)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var extraction = JsonSerializer.Deserialize<TcExtractionDto>(jsonContent, options)
                ?? throw new InvalidOperationException("JSON deserialization returned null");

            _logger.LogInformation(
                "Parsed extraction: ItemId={ItemId}, RevId={RevId}, VariantOptions count={Count}",
                extraction.SourceItemId,
                extraction.SourceRevId,
                extraction.VariantOptions?.Count ?? 0
            );

            return extraction;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "JSON parsing failed");
            throw new ArgumentException("Invalid JSON format", nameof(jsonContent), ex);
        }
    }

    /// <summary>
    /// Transforms Teamcenter extraction to Configit BOM structure.
    /// Recursively processes BOM tree, extracts part names, builds expressions.
    /// </summary>
    public BomStructureDto Transform(TcExtractionDto extraction)
    {
        _logger.LogInformation("Starting BOM transformation for item {ItemId}", extraction.SourceItemId);

        var bomTree = TransformNode(extraction.BomRoot, extraction.VariantOptions);

        _logger.LogInformation("BOM transformation complete. Root: {PartId}", bomTree.PartId);
        return bomTree;
    }

    /// <summary>
    /// Recursively transforms a BOM node to BomStructureDto.
    /// </summary>
    private BomStructureDto TransformNode(TcBomNode node, Dictionary<string, string[]> variantOptions)
    {
        var partId = node.ItemId;
        var partNumber = PartNameParser.ExtractPartNumber(node.Name);
        var partName = PartNameParser.CleanName(node.Name);
        var expression = VariantExpressionBuilder.BuildExpression(node.VariantCondition);
        var quantity = double.TryParse(node.Qty, out var qty) ? qty : 1.0;

        // Recursively transform children
        var components = node.Children?.Select(child => TransformNode(child!, variantOptions)).ToList()
            ?? new List<BomStructureDto>();

        _logger.LogDebug("Transformed node: {PartId} ({PartName}), children={ChildCount}", 
            partId, partName, components.Count);

        return BomStructureBuilder.Create()
            .WithPartId(partId)
            .WithPartName(partName)
            .WithPartNumber(partNumber)
            .WithComponents(components)
            .WithExpression(expression)
            .WithQuantity(quantity)
            .Build();
    }
}
