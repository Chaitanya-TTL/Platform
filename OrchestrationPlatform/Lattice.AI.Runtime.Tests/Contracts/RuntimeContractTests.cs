using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Tests.Contracts;

public sealed class RuntimeContractTests
{
    private static readonly JsonSerializerOptions ApiJsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower) }
    };

    [Fact]
    public void RuntimeRequestContext_RoundTripsRequestAndTraceIdentifiers()
    {
        var original = CreateRequestContext();

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<RuntimeRequestContext>(json);

        Assert.Contains("\"requestId\"", json);
        Assert.Contains("\"traceId\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.Equal(original.RequestId, deserialized.RequestId);
        Assert.Equal(original.TraceId, deserialized.TraceId);
    }

    [Fact]
    public void ImpactAnswerRequest_RoundTripsWithCamelCaseJson()
    {
        var original = new ImpactAnswerRequest(
            "investigation-1",
            "What changes if component ABC-123 is revised?",
            "conversation-42");

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<ImpactAnswerRequest>(json);

        Assert.Contains("\"conversationId\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
    }

    [Fact]
    public void ContextPackage_RoundTripsSchemaVersionsAndRequiredLists()
    {
        var original = new ContextPackage(
            CreateRequestContext(),
            "investigation-1",
            "package-12",
            "context-v3",
            "compiler-v5",
            "decision-9",
            new ResolvedEntity("plm", "Part", "part-17", "Housing"),
            new ImpactScope(new HashSet<string> { "depends-on" }, 3, new HashSet<string> { "plm" }, null),
            new[]
            {
                new ImpactClaim("claim-1", "Housing affects Frame.", ["part-17", "part-18"],
                    ["relationship-3"], ["evidence-1"], null, 0.85)
            },
            new[]
            {
                new EvidenceSourceReference("evidence-1", "relationship", "plm", "record-1",
                    "rev-2", null, "https://example.test/record-1", "provenance-1", "decision-9")
            },
            new[] { new ContextOmission("claim-2", "over budget") });

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<ContextPackage>(json);

        Assert.Contains("\"schemaVersion\":\"context-v3\"", json);
        Assert.Contains("\"compilerVersion\":\"compiler-v5\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.NotNull(deserialized.Claims);
        Assert.NotNull(deserialized.Sources);
        Assert.NotNull(deserialized.Omissions);
        Assert.NotNull(deserialized.Claims[0].EntityIds);
        Assert.NotNull(deserialized.Claims[0].RelationshipIds);
        Assert.NotNull(deserialized.Claims[0].EvidenceIds);
        Assert.Equal(0.85, deserialized.Claims[0].Confidence);
    }

    [Fact]
    public void ModelRequest_RoundTripsPromptAndOutputSchemaVersions()
    {
        var original = new ModelRequest(
            CreateRequestContext(),
            "engineering-impact",
            "prompt-v4",
            "package-12",
            "azure-gpt",
            new[] { new ModelMessage("user", "Summarize the supported impact.") },
            "answer-v2");

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<ModelRequest>(json);

        Assert.Contains("\"promptBundleVersion\":\"prompt-v4\"", json);
        Assert.Contains("\"outputSchemaVersion\":\"answer-v2\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.NotNull(deserialized.Messages);
    }

    [Fact]
    public void ModelResponse_RoundTripsRequestAndTraceIdentifiers()
    {
        var original = new ModelResponse(
            CreateRequestContext(),
            "{\"summary\":\"Supported impact.\"}",
            "azure-openai",
            "gpt-4.1",
            "2026-10",
            48,
            12,
            TimeSpan.FromMilliseconds(325));

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<ModelResponse>(json);

        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.Equal(original.RequestContext.RequestId, deserialized.RequestContext.RequestId);
        Assert.Equal(original.RequestContext.TraceId, deserialized.RequestContext.TraceId);
    }

    [Fact]
    public void AnswerCandidate_RoundTripsRequiredImpactLists()
    {
        var original = new AnswerCandidate(
            "The supported impact is limited to the frame.",
            new[]
            {
                new AnswerImpact("claim-1", "The frame is directly affected.",
                    ["evidence-1"], ["source-1"])
            },
            new[] { "One downstream relationship was omitted." });

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<AnswerCandidate>(json);

        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.NotNull(deserialized.Impacts);
        Assert.NotNull(deserialized.Warnings);
        Assert.NotNull(deserialized.Impacts[0].EvidenceIds);
        Assert.NotNull(deserialized.Impacts[0].SourceIds);
    }

    [Fact]
    public void QuestionInterpretation_UsesKebabCaseForEnumValues()
    {
        var original = new QuestionInterpretation(
            ImpactQuestionType.EngineeringImpact,
            "What is affected?",
            "Part",
            "part-17",
            null,
            Array.Empty<string>());

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<QuestionInterpretation>(json);

        Assert.Contains("\"type\":\"engineering-impact\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.NotNull(deserialized.ClarificationReasons);
    }

    [Fact]
    public void AuthorizationScope_RoundTripsRequiredGrants()
    {
        var original = new AuthorizationScope(
            "tenant-1",
            "subject-4",
            "policy-v2",
            "decision-9",
            new HashSet<string> { "read:part", "read:relationship" },
            DateTimeOffset.Parse("2026-11-17T10:00:00Z"));

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<AuthorizationScope>(json);

        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.True(original.Grants.SetEquals(deserialized.Grants));
        Assert.NotNull(deserialized.Grants);
    }

    private static RuntimeRequestContext CreateRequestContext() =>
        new("request-42", "4bf92f3577b34da6a3ce929d0e0e4736", "request-parent", "conversation-42");

    private static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, ApiJsonOptions)
        ?? throw new JsonException($"Could not deserialize {typeof(T).Name}.");
}
