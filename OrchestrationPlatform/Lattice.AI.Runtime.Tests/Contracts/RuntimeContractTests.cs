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
        original = original with
        {
            SourceEvidencePassages =
            [
                new SourceEvidencePassage(
                    "SYNTH-PASSAGE-001",
                    "SYNTH-RECORD-001",
                    "investigation-1",
                    1,
                    "Windchill",
                    "SYNTH-NATIVE-RECORD-001",
                    ["part-17"],
                    "rev-2",
                    "requirements[0].description",
                    "Synthetic source evidence.",
                    ["SYNTH-EVIDENCE-001"],
                    "SYNTH-PROVENANCE-001",
                    "decision-9",
                    "current",
                    "hybrid",
                    0.75,
                    "source-index-v1",
                    "synthetic-embedding-v1")
            ],
            Omissions =
            [
                new ContextOmission("SYNTH-PASSAGE-002", "duplicate source passage")
                {
                    Kind = ContextOmissionKind.SourceEvidencePassage
                }
            ],
            EngineeringFacts = [EngineeringFactCandidate()],
            ApplicationParticipation = [ApplicationParticipationCandidate()]
        };

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<ContextPackage>(json);

        Assert.Contains("\"schemaVersion\":\"context-v3\"", json);
        Assert.Contains("\"compilerVersion\":\"compiler-v5\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.NotNull(deserialized.Claims);
        Assert.NotNull(deserialized.Sources);
        Assert.NotNull(deserialized.SourceEvidencePassages);
        Assert.NotNull(deserialized.Omissions);
        Assert.NotNull(deserialized.Claims[0].EntityIds);
        Assert.NotNull(deserialized.Claims[0].RelationshipIds);
        Assert.NotNull(deserialized.Claims[0].EvidenceIds);
        Assert.Equal(0.85, deserialized.Claims[0].Confidence);
        Assert.Equal("SYNTH-PASSAGE-001", Assert.Single(deserialized.SourceEvidencePassages).PassageId);
        Assert.Equal(ContextOmissionKind.SourceEvidencePassage, Assert.Single(deserialized.Omissions).Kind);
        Assert.Equal("fact-context-1", Assert.Single(deserialized.EngineeringFacts).FactId);
        Assert.Equal(
            "participation-context-1",
            Assert.Single(deserialized.ApplicationParticipation).CandidateId);
    }

    [Fact]
    public void EngineeringFactEvidence_RoundTripsExactValuesLineageAndAuthorization()
    {
        using var exactValueDocument = JsonDocument.Parse("""{"amount":12.50,"currency":"USD"}""");
        using var normalizedValueDocument = JsonDocument.Parse("""{"amount":12.5,"currency":"USD"}""");
        using var dimensionValueDocument = JsonDocument.Parse("\"plant-7\"");
        var original = new EngineeringFactEvidence(
            "1.0",
            "fact-17",
            "investigation-1",
            7,
            "sap",
            "material-42",
            "material",
            "stock.quantity",
            "LABST",
            "Unrestricted stock",
            EngineeringFactRole.Metric,
            exactValueDocument.RootElement.Clone(),
            EngineeringFactValueType.Money,
            EngineeringFactValueType.Money,
            normalizedValueDocument.RootElement.Clone(),
            EngineeringFactValueType.Money,
            "USD",
            "USD",
            2,
            [new EngineeringFactDimension(
                "plant",
                "Plant",
                dimensionValueDocument.RootElement.Clone(),
                EngineeringFactValueType.Identifier,
                null)],
            DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
            DateTimeOffset.Parse("2026-11-18T10:01:00Z"),
            DateTimeOffset.Parse("2026-11-18T10:02:00Z"),
            DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
            null,
            null,
            EngineeringFactFreshness.Current,
            EngineeringFactCompleteness.Complete,
            EngineeringFactDerivationStatus.Raw,
            null,
            [],
            ["evidence-17"],
            ["citation-17"],
            true,
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "sap",
                "sap-synthetic-fixture",
                "MAT-42",
                "R3",
                "execution-8",
                "material-42",
                "sha256:source",
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-9");

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<EngineeringFactEvidence>(json);

        Assert.Contains("\"exactSourceValue\":{\"amount\":12.50,\"currency\":\"USD\"}", json);
        Assert.Contains("\"factRole\":\"metric\"", json);
        Assert.Contains("\"freshness\":\"current\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.Equal(12.50m, deserialized.ExactSourceValue.GetProperty("amount").GetDecimal());
        Assert.Equal(12.5m, deserialized.NormalizedValue?.GetProperty("amount").GetDecimal());
        Assert.Equal("plant-7", Assert.Single(deserialized.Dimensions).ExactValue.GetString());
        Assert.Equal("LABST", deserialized.SourceFieldName);
        Assert.Equal("decision-9", deserialized.AuthorizationDecisionId);
        Assert.Equal(["citation-17"], deserialized.CitationIds);
    }

    [Fact]
    public void ApplicationParticipationAndEnrichmentPlans_RoundTripWithoutRelationshipClaims()
    {
        var participation = new ApplicationParticipationEvidence(
            "1.0",
            "participation-1",
            "investigation-1",
            7,
            "windchill",
            ["part-17"],
            "gather-intelligence",
            SourceOperationStatus.Partial,
            EngineeringFactCompleteness.Partial,
            ["evidence-17"],
            ["citation-17"],
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "windchill",
                "windchill-synthetic-fixture",
                "WT-PART-17",
                "A",
                "execution-8",
                "part-17",
                null,
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-9");
        var planning = new ScopePlanningResult(
            ScopePlanningDisposition.Ready,
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            [],
            null,
            new FactEvidencePlan(true, ["part-17"], ["sap"], ["stock.quantity"], ["MAT-42"], "explicit-field"),
            new ApplicationContextPlan(true, ["part-17"], ["windchill"], "cross-application-context"));

        var participationJson = JsonSerializer.Serialize(participation, ApiJsonOptions);
        var planningJson = JsonSerializer.Serialize(planning, ApiJsonOptions);
        var deserializedParticipation = Deserialize<ApplicationParticipationEvidence>(participationJson);
        var deserializedPlanning = Deserialize<ScopePlanningResult>(planningJson);

        Assert.DoesNotContain("relationshipId", participationJson, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("partial", JsonDocument.Parse(participationJson)
            .RootElement.GetProperty("sourceOperationStatus").GetString());
        Assert.Equal(participationJson, JsonSerializer.Serialize(deserializedParticipation, ApiJsonOptions));
        Assert.Equal(planningJson, JsonSerializer.Serialize(deserializedPlanning, ApiJsonOptions));
        Assert.Equal(["stock.quantity"], deserializedPlanning.FactEvidencePlan?.FieldIds);
        Assert.True(deserializedPlanning.ApplicationContextPlan?.Requested);
    }

    [Theory]
    [InlineData(SourceOperationStatus.Requested, "requested")]
    [InlineData(SourceOperationStatus.Running, "running")]
    [InlineData(SourceOperationStatus.Succeeded, "succeeded")]
    [InlineData(SourceOperationStatus.Empty, "empty")]
    public void ApplicationParticipation_PreservesSourceOperationStatus(
        SourceOperationStatus status,
        string expectedStatus)
    {
        var participation = new ApplicationParticipationEvidence(
            "1.0",
            "participation-1",
            "investigation-1",
            7,
            "windchill",
            ["part-17"],
            "gather-intelligence",
            status,
            EngineeringFactCompleteness.Partial,
            ["evidence-17"],
            ["citation-17"],
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "windchill",
                "windchill-synthetic-fixture",
                "WT-PART-17",
                "A",
                "execution-8",
                "part-17",
                null,
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-9");

        var json = JsonSerializer.Serialize(participation, ApiJsonOptions);

        Assert.Equal(expectedStatus, JsonDocument.Parse(json)
            .RootElement.GetProperty("sourceOperationStatus").GetString());
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
    public void AnswerFactAssertion_PreservesExactNumericJsonText()
    {
        using var exactValueDocument = JsonDocument.Parse("2.50");
        var original = new AnswerFactAssertion(
            "fact-weight-1",
            exactValueDocument.RootElement.Clone(),
            ["fact-evidence-1"],
            ["fact-citation-1"]);

        var json = JsonSerializer.Serialize(original, ApiJsonOptions);
        var deserialized = Deserialize<AnswerFactAssertion>(json);

        Assert.Contains("\"exactValue\":2.50", json);
        Assert.Contains("\"exactValueJson\":\"2.50\"", json);
        Assert.Equal("2.50", deserialized.ExactValueJson);
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

    private static EngineeringFactEvidence EngineeringFactCandidate() =>
        new(
            "1.0",
            "fact-context-1",
            "investigation-1",
            1,
            "windchill",
            "WT-PART-17",
            "Part",
            "part.weight",
            "weight",
            "Weight",
            EngineeringFactRole.Metric,
            JsonDocument.Parse("2.5").RootElement.Clone(),
            EngineeringFactValueType.Quantity,
            EngineeringFactValueType.Quantity,
            null,
            null,
            "kg",
            null,
            1,
            [],
            DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
            null,
            null,
            null,
            null,
            null,
            EngineeringFactFreshness.Current,
            EngineeringFactCompleteness.Complete,
            EngineeringFactDerivationStatus.Raw,
            null,
            [],
            ["fact-evidence-1"],
            ["fact-citation-1"],
            true,
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "windchill",
                "windchill-fixture",
                "WT-PART-17",
                "A",
                "execution-1",
                "part-17",
                null,
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-9")
        {
            SubjectId = "part-17",
            SourceNativeId = "WT-PART-17"
        };

    private static ApplicationParticipationEvidence ApplicationParticipationCandidate() =>
        new(
            "1.0",
            "participation-context-1",
            "investigation-1",
            1,
            "windchill",
            ["part-17"],
            "gather-intelligence",
            SourceOperationStatus.Partial,
            EngineeringFactCompleteness.Partial,
            ["participation-evidence-1"],
            ["participation-citation-1"],
            EngineeringFactAuthority.SourceAuthoritative,
            new EngineeringFactProvenance(
                "windchill",
                "windchill-fixture",
                "WT-PART-17",
                "A",
                "execution-1",
                "part-17",
                null,
                DateTimeOffset.Parse("2026-11-18T10:00:00Z"),
                EngineeringFactAuthority.SourceAuthoritative),
            "decision-9");

    private static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, ApiJsonOptions)
        ?? throw new JsonException($"Could not deserialize {typeof(T).Name}.");
}
