using Configit.Ace.PackageBuilder.ProductCatalog;
using Configit.Ace.Model.Client;
using Configit.Ace.Compilation.Client;
using ConfigitAceIntegration.Models;
using ConfigitAceIntegration.Transformers;
using Microsoft.Extensions.Logging;

namespace ConfigitAceIntegration.Infrastructure.Builders;

public interface IProductCatalogBuilder
{
    IProductCatalog Create(string productName, TcExtractionDto extraction);
}

public class ProductCatalogBuilder : SourceFactoryProvider, IProductCatalogBuilder
{
    private readonly ILogger<ProductCatalogBuilder> _logger;

    public ProductCatalogBuilder(ILogger<ProductCatalogBuilder> logger)
    {
        _logger = logger;
    }

    public IProductCatalog Create(string productName, TcExtractionDto extraction)
    {
        _logger.LogInformation("Building ProductCatalog for {ProductName}", productName);

        var catalog = SourceFactory.ProductCatalog(null);

        // Format main product: name_itemid
        var mainProductName = PartNameParser.CleanName(extraction.BomRoot?.Name);
        var mainProductId = $"{mainProductName}_{productName}";

        // Add main product as configurable
        catalog = catalog.AddProduct(
            SourceFactory.Product(mainProductId, ProductType.Configurable));
        _logger.LogInformation("  ✓ Added main product: {ProductId} (configurable)", mainProductId);

        // Add all variant options and their values as standard products
        var productCount = 0;
        if (extraction.VariantOptions?.Count > 0)
        {
            foreach (var option in extraction.VariantOptions)
            {
                var variableName = option.Key;
                var values = option.Value;

                // Add variable as standard product
                catalog = catalog.AddProduct(
                    SourceFactory.Product(variableName, ProductType.Standard));
                productCount++;
                _logger.LogDebug("    Variable product: {VariableName}", variableName);

                // Add each value as standard product
                foreach (var value in values)
                {
                    catalog = catalog.AddProduct(
                        SourceFactory.Product(value, ProductType.Standard));
                    productCount++;
                    _logger.LogDebug("      Value product: {Value}", value);
                }
            }
            _logger.LogInformation("  ✓ Added {VariantCount} variant products", productCount);
        }

        // Add all nodes that have BOMs as products (so BOMs can reference them)
        if (extraction.BomRoot?.Children?.Length > 0)
        {
            var bomNodeCount = 0;
            AddBomNodeProducts(extraction.BomRoot, ref catalog, ref bomNodeCount);
            _logger.LogInformation("  ✓ Added {BomNodeCount} BOM node products", bomNodeCount);
        }

        return catalog;
    }

    private void AddBomNodeProducts(TcBomNode bomNode, ref IProductCatalog catalog, ref int nodeCount)
    {
        if (bomNode.Children?.Length > 0)
        {
            foreach (var child in bomNode.Children)
            {
                // Add this node as a standard product (it has children, so it gets a BOM)
                var childName = PartNameParser.CleanName(child.Name);
                var childItemId = child.ItemId;
                var productId = $"{childName}_{childItemId}";

                catalog = catalog.AddProduct(
                    SourceFactory.Product(productId, ProductType.Standard));
                nodeCount++;
                _logger.LogDebug("    BOM Node product: {ProductId}", productId);

                // Recursively add grandchildren
                AddBomNodeProducts(child, ref catalog, ref nodeCount);
            }
        }
    }
}
