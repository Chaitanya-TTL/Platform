using ConfigitAceIntegration.Models;
using ConfigitAceIntegration.Infrastructure;

namespace ConfigitAceIntegration.Abstractions;

/// <summary>
/// Service for building and publishing Configit AceModel work items from Teamcenter extraction data.
/// AceModel is used for managing product configurations and work items in Configit.
/// </summary>
public interface IAceModelService
{
    /// <summary>
    /// Creates or updates a work item in AceModel with the extracted Teamcenter data.
    /// </summary>
    /// <param name="productName">The product name/ID (e.g., "000575")</param>
    /// <param name="extraction">The parsed Teamcenter extraction data</param>
    /// <param name="variantRules">Optional list of variant rules from PLMXML</param>
    /// <param name="cancellationToken">Cancellation token for async operations</param>
    /// <returns>Task representing the asynchronous operation</returns>
    Task BuildAndPublishAsync(
        string productName,
        TcExtractionDto extraction,
        List<VariantRuleData>? variantRules = null,
        CancellationToken cancellationToken = default);
}
