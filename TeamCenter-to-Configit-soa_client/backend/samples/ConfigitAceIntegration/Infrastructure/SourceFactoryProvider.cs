using Configit.Ace.PackageBuilder;
using Configit.Ace.PackageBuilder.Factories;

namespace ConfigitAceIntegration.Infrastructure;

/// <summary>
/// Base class that provides access to SourceFactory for SDK integration
/// </summary>
public class SourceFactoryProvider
{
    /// <summary>
    /// Static factory for creating Configit SDK objects
    /// </summary>
    protected static readonly ISourceFactory SourceFactory = FactoryProvider.SourceFactory;
}
