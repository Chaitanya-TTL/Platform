using ConfigitAceIntegration.Dtos;
using ConfigitAceIntegration.Models;

namespace ConfigitAceIntegration.Infrastructure.Validators;

/// <summary>
/// Validates BOM structure schema and integrity.
/// </summary>
public static class BomSchemaValidator
{
    /// <summary>
    /// Validates a Teamcenter BOM tree for required fields and cycles.
    /// </summary>
    public static List<string> ValidateBomTree(TcBomNode root)
    {
        var errors = new List<string>();
        var visited = new HashSet<string>();

        ValidateBomNodeCycles(root, visited, errors, "");

        return errors;
    }

    /// <summary>
    /// Validates a transformed BomStructureDto tree.
    /// </summary>
    public static void ValidateBomStructure(BomStructureDto node, string path, List<string> errors)
    {
        var nodePath = string.IsNullOrEmpty(path) ? node.PartId : $"{path}/{node.PartId}";

        // Required fields
        if (string.IsNullOrEmpty(node.PartId))
            errors.Add($"PartId missing at {nodePath}");

        if (string.IsNullOrEmpty(node.PartName))
            errors.Add($"PartName missing at {nodePath}");

        if (string.IsNullOrEmpty(node.PartNumber))
            errors.Add($"PartNumber missing at {nodePath}");

        // Expression validation if present
        if (node.Expressions != null)
        {
            ExpressionValidator.ValidateExpression(node.Expressions.Definition, nodePath, errors);
        }

        // Recursive validation on components
        if (node.Components != null)
        {
            foreach (var child in node.Components)
            {
                ValidateBomStructure(child, nodePath, errors);
            }
        }
    }

    private static void ValidateBomNodeCycles(TcBomNode node, HashSet<string> visited, List<string> errors, string path)
    {
        if (visited.Contains(node.ItemId))
        {
            errors.Add($"Circular reference detected: {path}/{node.ItemId}");
            return;
        }

        visited.Add(node.ItemId);

        if (node.Children != null)
        {
            var childPath = string.IsNullOrEmpty(path) ? node.ItemId : $"{path}/{node.ItemId}";
            foreach (var child in node.Children)
            {
                ValidateBomNodeCycles(child, new HashSet<string>(visited), errors, childPath);
            }
        }
    }
}
