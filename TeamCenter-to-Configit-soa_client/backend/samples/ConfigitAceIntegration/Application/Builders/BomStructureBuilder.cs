using ConfigitAceIntegration.Dtos;

namespace ConfigitAceIntegration.Application.Builders;

/// <summary>
/// Fluent builder for constructing BomStructureDto trees.
/// </summary>
public class BomStructureBuilder
{
    private string? _partId;
    private string? _partName;
    private string? _partNumber;
    private readonly List<BomStructureDto> _components = new();
    private PartAssignExpressionDto? _expressions;
    private PartUseDto? _partUse;

    public BomStructureBuilder WithPartId(string partId)
    {
        _partId = partId;
        return this;
    }

    public BomStructureBuilder WithPartName(string partName)
    {
        _partName = partName;
        return this;
    }

    public BomStructureBuilder WithPartNumber(string partNumber)
    {
        _partNumber = partNumber;
        return this;
    }

    public BomStructureBuilder WithComponent(BomStructureDto component)
    {
        _components.Add(component);
        return this;
    }

    public BomStructureBuilder WithComponents(IEnumerable<BomStructureDto> components)
    {
        _components.AddRange(components);
        return this;
    }

    public BomStructureBuilder WithExpression(PartAssignExpressionDto? expression)
    {
        _expressions = expression;
        return this;
    }

    public BomStructureBuilder WithPartUse(PartUseDto? partUse)
    {
        _partUse = partUse;
        return this;
    }

    public BomStructureBuilder WithQuantity(double quantity)
    {
        _partUse = new PartUseDto(quantity);
        return this;
    }

    public BomStructureDto Build()
    {
        if (string.IsNullOrEmpty(_partId))
            throw new InvalidOperationException("PartId is required");
        if (string.IsNullOrEmpty(_partName))
            throw new InvalidOperationException("PartName is required");
        if (string.IsNullOrEmpty(_partNumber))
            throw new InvalidOperationException("PartNumber is required");

        var components = _components.Count > 0 ? _components.AsReadOnly() : null;
        _partUse ??= new PartUseDto(1.0);

        return new BomStructureDto(
            PartId: _partId,
            PartName: _partName,
            PartNumber: _partNumber,
            Components: components,
            Expressions: _expressions,
            PartUse: _partUse
        );
    }

    public static BomStructureBuilder Create() => new();
}
