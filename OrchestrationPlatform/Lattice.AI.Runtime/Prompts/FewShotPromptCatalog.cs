using System.Text.Json;
using Lattice.AI.Runtime.Generation;

namespace Lattice.AI.Runtime.Prompts;

public sealed class FewShotPromptCatalog
{
    private const string PromptSetId = "engineering-impact-few-shot";
    private const string PromptSetVersion = "v1";
    private const string BasePromptId = "engineering-impact";
    private const string BasePromptVersion = "v2";
    private const string Classification = "synthetic-fixture-only";
    private const string ResourcePrefix = "Lattice.AI.Runtime.Prompts.engineering-impact.few-shot.v1.";
    private const int MaximumAssetCharacters = 256_000;
    private const int MaximumExamples = 10;
    private const int MaximumFieldLength = 10_000;
    private const int MaximumBehaviorTags = 20;

    public FewShotPromptSet GetRequired(string id, string version)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(version);

        if (!string.Equals(id, PromptSetId, StringComparison.Ordinal) ||
            !string.Equals(version, PromptSetVersion, StringComparison.Ordinal))
        {
            throw new KeyNotFoundException($"Few-shot prompt set '{id}/{version}' is not available.");
        }

        return Parse(ReadResource("manifest.json"), ReadResource("examples.json"));
    }

    internal static FewShotPromptSet Parse(string manifestJson, string examplesJson)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(manifestJson);
        ArgumentException.ThrowIfNullOrWhiteSpace(examplesJson);
        if (manifestJson.Length > MaximumAssetCharacters || examplesJson.Length > MaximumAssetCharacters)
        {
            throw new InvalidDataException("Few-shot prompt assets exceed the maximum supported size.");
        }

        try
        {
            using var manifestDocument = JsonDocument.Parse(
                manifestJson,
                new JsonDocumentOptions { MaxDepth = 16, AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow });
            using var examplesDocument = JsonDocument.Parse(
                examplesJson,
                new JsonDocumentOptions { MaxDepth = 16, AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow });

            var manifest = manifestDocument.RootElement;
            ValidateObjectProperties(
                manifest,
                "schemaVersion",
                "id",
                "version",
                "basePromptId",
                "basePromptVersion",
                "classification",
                "examplesFile",
                "exampleCount");

            if (RequiredString(manifest, "schemaVersion") != "few-shot-prompt-set/v1" ||
                RequiredString(manifest, "id") != PromptSetId ||
                RequiredString(manifest, "version") != PromptSetVersion ||
                RequiredString(manifest, "basePromptId") != BasePromptId ||
                RequiredString(manifest, "basePromptVersion") != BasePromptVersion ||
                RequiredString(manifest, "classification") != Classification ||
                RequiredString(manifest, "examplesFile") != "examples.json")
            {
                throw new InvalidDataException("The few-shot prompt manifest does not match the supported set contract.");
            }

            var exampleCount = RequiredInt32(manifest, "exampleCount");
            if (exampleCount is <= 0 or > MaximumExamples)
            {
                throw new InvalidDataException($"Few-shot prompt sets must contain between 1 and {MaximumExamples} examples.");
            }

            var examplesElement = examplesDocument.RootElement;
            if (examplesElement.ValueKind != JsonValueKind.Array ||
                examplesElement.GetArrayLength() != exampleCount)
            {
                throw new InvalidDataException("The few-shot example count does not match its manifest.");
            }

            var examples = examplesElement.EnumerateArray()
                .Select(ParseExample)
                .ToArray();
            if (examples.Select(example => example.Id).Distinct(StringComparer.Ordinal).Count() != examples.Length)
            {
                throw new InvalidDataException("Few-shot example IDs must be unique.");
            }

            return new FewShotPromptSet(
                PromptSetId,
                PromptSetVersion,
                BasePromptId,
                BasePromptVersion,
                Classification,
                Array.AsReadOnly(examples));
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("A few-shot prompt asset contains invalid JSON or answer data.", exception);
        }
    }

    private static FewShotPromptExample ParseExample(JsonElement element)
    {
        ValidateObjectProperties(element, "id", "intent", "question", "context", "expectedAnswer", "behaviorTags");

        var id = RequiredString(element, "id");
        if (!id.StartsWith("SYNTH-EXAMPLE-", StringComparison.Ordinal))
        {
            throw new InvalidDataException("Few-shot example IDs must use the synthetic example namespace.");
        }

        var intentName = RequiredString(element, "intent");
        if (!Enum.TryParse<FewShotPromptIntent>(intentName, ignoreCase: false, out var intent) ||
            !Enum.IsDefined(intent))
        {
            throw new InvalidDataException($"Few-shot example '{id}' has unsupported intent '{intentName}'.");
        }

        var question = RequiredString(element, "question");
        var context = RequiredString(element, "context");
        var expectedAnswer = RequiredString(element, "expectedAnswer");
        if (question.Length > MaximumFieldLength ||
            context.Length > MaximumFieldLength ||
            expectedAnswer.Length > MaximumFieldLength)
        {
            throw new InvalidDataException($"Few-shot example '{id}' exceeds a supported field length.");
        }

        using (JsonDocument.Parse(context, new JsonDocumentOptions { MaxDepth = 16 }))
        {
        }

        _ = new AnswerCandidateParser().Parse(expectedAnswer);
        var tagsElement = RequiredArray(element, "behaviorTags");
        var tags = tagsElement.EnumerateArray()
            .Select(value =>
            {
                if (value.ValueKind != JsonValueKind.String ||
                    string.IsNullOrWhiteSpace(value.GetString()))
                {
                    throw new InvalidDataException($"Few-shot example '{id}' has an invalid behavior tag.");
                }

                return value.GetString()!;
            })
            .ToArray();
        if (tags.Length is 0 or > MaximumBehaviorTags ||
            tags.Distinct(StringComparer.Ordinal).Count() != tags.Length)
        {
            throw new InvalidDataException($"Few-shot example '{id}' must have unique behavior tags.");
        }

        return new FewShotPromptExample(
            id,
            intent,
            question,
            context,
            expectedAnswer,
            Array.AsReadOnly(tags));
    }

    private static void ValidateObjectProperties(JsonElement element, params string[] expectedProperties)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("A few-shot prompt asset entry must be a JSON object.");
        }

        var expected = new HashSet<string>(expectedProperties, StringComparer.Ordinal);
        var found = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!expected.Contains(property.Name) || !found.Add(property.Name))
            {
                throw new InvalidDataException($"A few-shot prompt asset has an unknown or duplicate field '{property.Name}'.");
            }
        }

        if (!found.SetEquals(expected))
        {
            throw new InvalidDataException("A few-shot prompt asset is missing required fields.");
        }
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(property.GetString()))
        {
            throw new InvalidDataException($"The few-shot prompt asset is missing a non-empty '{propertyName}'.");
        }

        return property.GetString()!;
    }

    private static int RequiredInt32(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Number ||
            !property.TryGetInt32(out var value))
        {
            throw new InvalidDataException($"The few-shot prompt asset is missing a valid '{propertyName}'.");
        }

        return value;
    }

    private static JsonElement RequiredArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException($"The few-shot prompt asset is missing array '{propertyName}'.");
        }

        return property;
    }

    private static string ReadResource(string fileName)
    {
        using var stream = typeof(FewShotPromptCatalog).Assembly.GetManifestResourceStream(ResourcePrefix + fileName)
            ?? throw new InvalidDataException($"The embedded few-shot prompt resource '{fileName}' is missing.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
