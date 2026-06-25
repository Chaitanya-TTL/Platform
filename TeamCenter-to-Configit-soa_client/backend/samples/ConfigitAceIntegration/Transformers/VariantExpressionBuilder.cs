using ConfigitAceIntegration.Dtos;

namespace ConfigitAceIntegration.Transformers;

public static class VariantExpressionBuilder
{
    public static PartAssignExpressionDto? BuildExpression(string? variantCondition)
    {
        if (string.IsNullOrWhiteSpace(variantCondition))
            return null;

        return new PartAssignExpressionDto(
            ExpressionAssignableID: "VariantCondition",
            Definition: variantCondition.Trim(),
            DetailItems: Array.Empty<DetailItemDto>() // Simplified - no detail items needed
        );
    }
}
