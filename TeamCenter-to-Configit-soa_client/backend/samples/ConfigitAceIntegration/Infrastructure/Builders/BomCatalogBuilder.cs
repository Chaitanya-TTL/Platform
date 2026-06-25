using Configit.Ace.PackageBuilder.BOMCatalog;
using Configit.Ace.PackageBuilder.Calculations;
using Configit.Ace.PackageBuilder.Logic;
using Configit.Internal.OperatorPrecedenceParser;
using Configit.Ace.Model.Client;
using Configit.Ace.Compilation.Client;
using ConfigitAceIntegration.Models;
using ConfigitAceIntegration.Transformers;
using Microsoft.Extensions.Logging;

namespace ConfigitAceIntegration.Infrastructure.Builders;

public interface IBomCatalogBuilder
{
    IBomCatalog Create(string productName, TcExtractionDto extraction);
}

public class BomCatalogBuilder : SourceFactoryProvider, IBomCatalogBuilder
{
    private readonly ILogger<BomCatalogBuilder> _logger;

    public BomCatalogBuilder(ILogger<BomCatalogBuilder> logger)
    {
        _logger = logger;
    }

    public IBomCatalog Create(string productName, TcExtractionDto extraction)
    {
        _logger.LogInformation("Building BOM Catalog for {ProductName}", productName);

        var bomCatalog = SourceFactory.BomCatalog()
            .AddUnit(unit => unit("EA", domain => domain.Numeric(), 1, true).WithScale(0));

        _logger.LogInformation("  ✓ Added unit: EA");

        // Build all BOMs (one for root, one for each node that has children)
        var bomCount = 0;
        if (extraction.BomRoot != null)
        {
            bomCount += AddBomsRecursively(extraction.BomRoot, ref bomCatalog);
        }

        _logger.LogInformation("  ✓ Added {BomCount} total BOMs", bomCount);
        return bomCatalog;
    }

    private int AddBomsRecursively(TcBomNode node, ref IBomCatalog bomCatalog)
    {
        var bomCount = 0;
        
        // Create readable product ID: name_itemid
        var nodeName = PartNameParser.CleanName(node.Name);
        var nodeId = node.ItemId;
        var productId = $"{nodeName}_{nodeId}";

        // Create BOM for this node if it has children
        if (node.Children?.Length > 0)
        {
            var bom = BuildBom(productId, node);
            bomCatalog = bomCatalog.AddBom(bom);
            bomCount++;
            _logger.LogInformation("  ✓ Added BOM: {BomName} with {ComponentCount} components", 
                productId, node.Children.Length);

            // Recursively create BOMs for all children that have their own children
            foreach (var child in node.Children)
            {
                bomCount += AddBomsRecursively(child, ref bomCatalog);
            }
        }

        return bomCount;
    }

    private IBom BuildBom(string productName, TcBomNode bomRoot)
    {
        var bom = SourceFactory.Bom(productName, productName);

        if (bomRoot.Children?.Length > 0)
        {
            // Extract parent name for generating default conditions
            string parentName = PartNameParser.CleanName(bomRoot.Name);

            foreach (var child in bomRoot.Children)
            {
                // Create readable product ID: name_itemid
                var childName = PartNameParser.CleanName(child.Name);
                var childItemId = child.ItemId;
                var productId = $"{childName}_{childItemId}";
                var qty = string.IsNullOrEmpty(child.Qty) ? 1 : int.TryParse(child.Qty, out var q) ? q : 1;

                // Generate default condition for second-level children (leaf nodes)
                string? variantCondition = GenerateDefaultCondition(child, parentName);

                // Create BOM item with or without condition (5th parameter)
                if (!string.IsNullOrWhiteSpace(variantCondition))
                {
                    // Parse condition string to extract variable and constant
                    // Format: "ParentName = \"ChildName\""
                    var conditionParts = variantCondition.Split('=');
                    if (conditionParts.Length == 2)
                    {
                        var varName = NormalizeForConfigit(conditionParts[0].Trim());  // Normalize variable name
                        var constValue = NormalizeForConfigit(conditionParts[1].Trim().Trim('"'));  // Normalize constant value
                        
                        // Build expression: Variable("PARENT_NAME") = Constant("CHILD_NAME")
                        var expr = SourceFactory.Expr.Binary(
                            ExprOpr.Eq,
                            SourceFactory.Expr.Variable(varName),
                            SourceFactory.Expr.Constant(constValue));
                        
                        var bomItem = SourceFactory.BomItem.BomProductItem(
                            $"{productName}_{productId}",
                            productId,
                            "",
                            builder => builder(factory => factory.Static(qty)),
                            cf => cf.Expression(expr));  // 5th parameter: condition
                        
                        bom = bom.AddBomItem(bomItem);
                        _logger.LogInformation("    ✓ BOM Item: {ProductId} (qty: {Qty}) [CONDITION APPLIED: {Condition}]", 
                            productId, qty, variantCondition);
                    }
                }
                else
                {
                    var bomItem = SourceFactory.BomItem.BomProductItem(
                        $"{productName}_{productId}",
                        productId,
                        "",
                        builder => builder(factory => factory.Static(qty)));
                    
                    bom = bom.AddBomItem(bomItem);
                    _logger.LogDebug("    BOM Item: {ProductId} (qty: {Qty})", productId, qty);
                }
            }
        }

        return bom;
    }

    /// <summary>
    /// Generates a default condition for second-level children (leaf nodes with no existing condition).
    /// Format: Parent = "Child" (e.g., "Body = \"Top\"")
    /// </summary>
    private string? GenerateDefaultCondition(TcBomNode child, string parentName)
    {
        // Only generate conditions for leaf nodes (second-level children)
        // Leaf nodes have no children and no existing condition
        if (child.Children == null || child.Children.Length == 0)
        {
            if (string.IsNullOrWhiteSpace(child.VariantCondition))
            {
                // Extract child name (without item ID and revision)
                string childDisplayName = PartNameParser.CleanName(child.Name);
                return $"{parentName} = \"{childDisplayName}\"";
            }
            else
            {
                return child.VariantCondition;
            }
        }

        // Non-leaf nodes don't get default conditions
        return null;
    }

    private string NormalizeForConfigit(string name)
    {
        // Normalize like AceWindchill: spaces to _, dots to -, uppercase
        if (string.IsNullOrEmpty(name))
            return name;
        return name.Replace(' ', '_').Replace('.', '-').ToUpperInvariant();
    }
}
