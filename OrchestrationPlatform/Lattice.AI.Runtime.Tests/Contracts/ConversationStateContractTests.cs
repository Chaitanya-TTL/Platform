using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;

namespace Lattice.AI.Runtime.Tests.Contracts;

public sealed class ConversationStateContractTests
{
    private static readonly JsonSerializerOptions ApiJsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower) }
    };

    [Fact]
    public void ConversationState_RoundTripsVersionedStructuredReferencesAndFilters()
    {
        var state = new ConversationState(
            1,
            "conversation-1",
            "investigation-1",
            3,
            ["part-17"],
            [new ValidatedEntityReference("part-17", "Part", "Windchill")],
            new ConversationApplicationFilters(["Windchill"], ["SAP"]),
            ["depends-on"],
            new ImpactScope(new HashSet<string> { "depends-on" }, 3, new HashSet<string> { "Windchill" }, null),
            ConversationOutputDimension.Impact,
            "turn-2",
            "context-2",
            12,
            "source-v4",
            "ontology-v2",
            "owner-fingerprint",
            null,
            ConversationTurnDisposition.Answer,
            DateTimeOffset.Parse("2026-11-19T10:00:00Z"),
            DateTimeOffset.Parse("2026-11-19T10:05:00Z"),
            DateTimeOffset.Parse("2026-11-20T10:00:00Z"));

        var json = JsonSerializer.Serialize(state, ApiJsonOptions);
        var deserialized = Deserialize<ConversationState>(json);

        Assert.Contains("\"schemaVersion\":1", json);
        Assert.Contains("\"currentValidatedEntityRefs\"", json);
        Assert.Contains("\"targetApplications\":[\"SAP\"]", json);
        Assert.Contains("\"outputDimension\":\"impact\"", json);
        Assert.Contains("\"lastTurnDisposition\":\"answer\"", json);
        Assert.Equal(json, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
        Assert.Equal("part-17", deserialized.CurrentValidatedEntityRefs[0].CanonicalId);
        Assert.Equal(["SAP"], deserialized.ApplicationFilters.TargetApplications);
    }

    [Fact]
    public void ConversationTurnInput_WithNoPriorStateRepresentsANewTurn()
    {
        const string json = """
            {
              "question": "What impacts if R-123 changes?",
              "investigationId": "investigation-1",
              "conversationId": "conversation-1",
              "turnId": "turn-1"
            }
            """;
        var deserialized = Deserialize<ConversationTurnInput>(json);

        Assert.Null(deserialized.PreviousState);
        Assert.Equal("turn-1", deserialized.TurnId);
    }

    [Fact]
    public void TurnInterpretationAndClarificationUseStableKebabCaseValues()
    {
        var interpretation = new ConversationTurnInterpretation(
            ConversationTurnType.FollowUpFilter,
            [],
            ["part-17"],
            new ConversationFilterDelta(null, ["SAP"], null, null, null),
            ConversationOutputDimension.Impact,
            false,
            [],
            false);
        var clarification = new ConversationClarification(
            "multiple-candidates",
            "Which material do you mean?",
            [new ValidatedEntityReference("part-17", "Part", "Windchill")],
            3,
            "select-candidate");

        var interpretationJson = JsonSerializer.Serialize(interpretation, ApiJsonOptions);
        var clarificationJson = JsonSerializer.Serialize(clarification, ApiJsonOptions);
        var deserialized = Deserialize<ConversationTurnInterpretation>(interpretationJson);

        Assert.Contains("\"type\":\"follow-up-filter\"", interpretationJson);
        Assert.Contains("\"outputDimension\":\"impact\"", interpretationJson);
        Assert.Contains("\"expectedNextTurnAction\":\"select-candidate\"", clarificationJson);
        Assert.Equal(interpretationJson, JsonSerializer.Serialize(deserialized, ApiJsonOptions));
    }

    [Fact]
    public void ImpactAnswerResult_RemainsCompatibleWhenContinuationFieldsAreAbsent()
    {
        const string existingResponse = """
            {
              "investigationId": "investigation-1",
              "requestContext": {
                "requestId": "request-1",
                "traceId": "trace-1",
                "parentRequestId": null,
                "conversationId": "conversation-1"
              },
              "disposition": "answer",
              "summary": "Supported impact.",
              "impacts": [],
              "sources": [],
              "issues": [],
              "contextPackageId": "context-1",
              "semanticSupportStatus": "supported"
            }
            """;

        var result = Deserialize<ImpactAnswerResult>(existingResponse);

        Assert.Null(result.ContinuationState);
        Assert.Null(result.Clarification);
        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
    }

    private static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, ApiJsonOptions)
        ?? throw new JsonException($"Could not deserialize {typeof(T).Name}.");
}
