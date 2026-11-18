using System.Text.Json;
using Lattice.AI.Runtime.Contracts.Answers;

namespace Lattice.AI.Runtime.Generation;

public sealed class AnswerCandidateParser : IAnswerCandidateParser
{
    public const string SupportedSchemaVersion = "answer-v1";

    public AnswerCandidate Parse(string content)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new JsonException("The answer content must contain a JSON value.");
        }

        using var document = JsonDocument.Parse(
            content,
            new JsonDocumentOptions { AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow, MaxDepth = 32 });
        var root = document.RootElement;
        EnsureObject(root, "The answer must be a JSON object.");
        EnsureProperties(root, "schemaVersion", "summary", "impacts", "warnings");

        var schemaVersion = RequiredString(root, "schemaVersion", allowEmpty: false);
        if (!string.Equals(schemaVersion, SupportedSchemaVersion, StringComparison.Ordinal))
        {
            throw new JsonException($"Unsupported answer schema version '{schemaVersion}'.");
        }

        var summary = RequiredString(root, "summary", allowEmpty: false);
        var impactsElement = RequiredArray(root, "impacts");
        var warningsElement = RequiredArray(root, "warnings");

        var impacts = impactsElement
            .EnumerateArray()
            .Select(ParseImpact)
            .ToArray();
        var warnings = warningsElement
            .EnumerateArray()
            .Select(warning => ReadArrayString(warning, "warnings"))
            .ToArray();

        return new AnswerCandidate(summary, impacts, warnings);
    }

    private static AnswerImpact ParseImpact(JsonElement element)
    {
        EnsureObject(element, "Each impact must be a JSON object.");
        EnsureProperties(element, "claimId", "explanation", "evidenceIds", "sourceIds");
        var evidenceIds = ReadStringArray(RequiredArray(element, "evidenceIds"), "evidenceIds");
        var sourceIds = ReadStringArray(RequiredArray(element, "sourceIds"), "sourceIds");
        if (evidenceIds.Length == 0 || sourceIds.Length == 0)
        {
            throw new JsonException("Each impact must reference at least one evidence ID and one source ID.");
        }

        return new AnswerImpact(
            RequiredString(element, "claimId", allowEmpty: false),
            RequiredString(element, "explanation", allowEmpty: false),
            evidenceIds,
            sourceIds);
    }

    private static JsonElement RequiredArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Array)
        {
            throw new JsonException($"Required array '{propertyName}' is missing or invalid.");
        }

        return property;
    }

    private static string RequiredString(JsonElement element, string propertyName, bool allowEmpty)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            throw new JsonException($"Required string '{propertyName}' is missing or invalid.");
        }

        var value = property.GetString();
        if (value is null || (!allowEmpty && string.IsNullOrWhiteSpace(value)))
        {
            throw new JsonException($"Required string '{propertyName}' cannot be empty.");
        }

        return value;
    }

    private static string ReadArrayString(JsonElement element, string propertyName)
    {
        if (element.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(element.GetString()))
        {
            throw new JsonException($"Every value in '{propertyName}' must be a non-empty string.");
        }

        return element.GetString()!;
    }

    private static string[] ReadStringArray(JsonElement element, string propertyName)
    {
        return element.EnumerateArray()
            .Select(value => ReadArrayString(value, propertyName))
            .ToArray();
    }

    private static void EnsureObject(JsonElement element, string message)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new JsonException(message);
        }
    }

    private static void EnsureProperties(JsonElement element, params string[] allowedProperties)
    {
        var allowed = new HashSet<string>(allowedProperties, StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!allowed.Contains(property.Name))
            {
                throw new JsonException($"Unknown answer schema field '{property.Name}'.");
            }

            if (!seen.Add(property.Name))
            {
                throw new JsonException($"Duplicate answer schema field '{property.Name}'.");
            }
        }

        foreach (var propertyName in allowedProperties)
        {
            if (!seen.Contains(propertyName))
            {
                throw new JsonException($"Required answer schema field '{propertyName}' is missing.");
            }
        }
    }
}
