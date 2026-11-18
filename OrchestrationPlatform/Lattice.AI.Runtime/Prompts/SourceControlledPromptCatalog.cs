using System.Text.Json;
using Lattice.AI.Runtime.Generation;

namespace Lattice.AI.Runtime.Prompts;

public sealed class SourceControlledPromptCatalog : IPromptCatalog
{
    private const string PromptId = "engineering-impact";
    private const string PromptVersion = "v1";
    private const string ResourcePrefix = "Lattice.AI.Runtime.Prompts.engineering-impact.v1.";

    public PromptBundle GetRequired(string id, string version)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(version);

        if (!string.Equals(id, PromptId, StringComparison.Ordinal) ||
            !string.Equals(version, PromptVersion, StringComparison.Ordinal))
        {
            throw new KeyNotFoundException($"Prompt bundle '{id}/{version}' is not available.");
        }

        using var manifestStream = OpenResource("manifest.json");
        using var manifest = JsonDocument.Parse(manifestStream);
        var root = manifest.RootElement;
        ValidateManifestShape(root);
        var manifestId = RequiredString(root, "id");
        var manifestVersion = RequiredString(root, "version");
        var outputSchemaVersion = RequiredString(root, "outputSchemaVersion");

        if (!string.Equals(manifestId, PromptId, StringComparison.Ordinal) ||
            !string.Equals(manifestVersion, PromptVersion, StringComparison.Ordinal))
        {
            throw new InvalidDataException("The embedded prompt manifest does not match its catalog ID and version.");
        }

        if (!string.Equals(outputSchemaVersion, AnswerCandidateParser.SupportedSchemaVersion, StringComparison.Ordinal))
        {
            throw new InvalidDataException("The embedded prompt manifest references an unsupported answer schema version.");
        }

        var requiredSections = root.GetProperty("requiredSections")
            .EnumerateArray()
            .Select(section => section.GetString())
            .ToArray();
        var expectedSections = new[] { "system-policy.md", "domain-guidance.md", "impact-task.md" };
        if (!requiredSections.SequenceEqual(expectedSections, StringComparer.Ordinal))
        {
            throw new InvalidDataException("The embedded prompt manifest has an unexpected required-section list.");
        }

        return new PromptBundle(
            PromptId,
            PromptVersion,
            outputSchemaVersion,
            ReadResource("system-policy.md"),
            ReadResource("domain-guidance.md"),
            ReadResource("impact-task.md"));
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(property.GetString()))
        {
            throw new InvalidDataException($"The embedded prompt manifest is missing '{propertyName}'.");
        }

        return property.GetString()!;
    }

    private static void ValidateManifestShape(JsonElement manifest)
    {
        if (manifest.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("The embedded prompt manifest must be a JSON object.");
        }

        var expectedProperties = new HashSet<string>(
            ["id", "version", "outputSchemaVersion", "requiredSections"],
            StringComparer.Ordinal);
        var foundProperties = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in manifest.EnumerateObject())
        {
            if (!expectedProperties.Contains(property.Name) || !foundProperties.Add(property.Name))
            {
                throw new InvalidDataException($"The embedded prompt manifest has an unknown or duplicate field '{property.Name}'.");
            }
        }

        if (!foundProperties.SetEquals(expectedProperties))
        {
            throw new InvalidDataException("The embedded prompt manifest is missing required fields.");
        }
    }

    private static string ReadResource(string fileName)
    {
        using var stream = OpenResource(fileName);
        using var reader = new StreamReader(stream);
        var content = reader.ReadToEnd();
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidDataException($"The embedded prompt section '{fileName}' is empty.");
        }

        return content.Trim();
    }

    private static Stream OpenResource(string fileName)
    {
        var resourceName = ResourcePrefix + fileName;
        return typeof(SourceControlledPromptCatalog).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidDataException($"The embedded prompt resource '{resourceName}' is missing.");
    }
}
