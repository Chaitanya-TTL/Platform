using System.Text.Json;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.Telemetry;
using Lattice.AI.Runtime.Validation;

namespace Lattice.AI.Runtime.Tests.Application;

public sealed class ImpactAnswerServiceTests
{
    [Fact]
    public async Task AnswerAsync_ReturnsValidatedAnswerAndScopedSources()
    {
        var fixture = new Fixture();

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Equal("investigation-1", result.InvestigationId);
        Assert.Equal("request-1", result.RequestContext.RequestId);
        Assert.False(string.IsNullOrWhiteSpace(result.ContextPackageId));
        Assert.Single(result.Impacts);
        Assert.Single(result.Sources);
        Assert.Equal(1, fixture.ScopePlanner.CallCount);
        Assert.Same(fixture.Resolver.Authorization, fixture.EvidenceSource.Authorization);
        Assert.Equal(1, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_DoesNotPersistContinuationStateWithoutConfiguredRetention()
    {
        var fixture = new Fixture();

        var result = await fixture.Service.AnswerAsync(
            Request(),
            Authorization(),
            RequestContext() with { TurnId = "turn-1" },
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
        Assert.Null(result.ContinuationState);
    }

    [Fact]
    public async Task AnswerAsync_RecordsGroundedQualityCoverageAndReferencedClaimConfidence()
    {
        const string modelContent =
            """{"schemaVersion":"answer-v1","summary":"REQ-123 impacts P-1.","impacts":[{"claimId":"chain-1","explanation":"REQ-123 impacts P-1.","evidenceIds":["evidence-1"],"sourceIds":["citation-1"]}],"warnings":[]}""";
        var evidence = Evidence() with
        {
            Chains =
            [
                new ImpactChainEvidence(
                    "chain-1",
                    "REQ-123",
                    "P-1",
                    ["relationship-1"],
                    [],
                    ["evidence-1"],
                    ["citation-1"],
                    "REQ-123 impacts P-1.",
                    0.875,
                    "validated impact",
                    "active",
                    "strong"),
                new ImpactChainEvidence(
                    "chain-2",
                    "REQ-123",
                    "P-2",
                    ["relationship-1"],
                    [],
                    ["evidence-1"],
                    ["citation-1"],
                    "REQ-123 impacts P-2.",
                    0.125,
                    "unreferenced impact",
                    "active",
                    "strong")
            ]
        };
        var telemetry = new RecordingTelemetry();
        var fixture = new Fixture(
            evidence: evidence,
            modelContent: modelContent,
            telemetry: telemetry);

        var result = await fixture.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
        var summary = Assert.Single(telemetry.AnswerQualitySummaries);
        Assert.True(summary.Grounded);
        Assert.Equal(0, summary.UnsupportedAssertionRejectionCount);
        Assert.Equal(1.0, summary.EvidenceCitationCoverageRatio);
        Assert.Equal([0.875], summary.SourceClaimConfidenceValues);
    }

    [Fact]
    public async Task AnswerAsync_RecordsUnsupportedAssertionsForRejectedAnswer()
    {
        const string modelContent =
            """{"schemaVersion":"answer-v1","summary":"REQ-999 is affected.","impacts":[{"claimId":"relationship:relationship-1","explanation":"REQ-123 affects P-1.","evidenceIds":["missing-evidence"],"sourceIds":["missing-source"]}],"warnings":["unsupported"]}""";
        var telemetry = new RecordingTelemetry();
        var fixture = new Fixture(modelContent: modelContent, telemetry: telemetry);

        var result = await fixture.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Equal(
            4,
            result.Issues.Count(issue => issue.Code is
                "unsupported-identifier" or
                "unsupported-warning" or
                "unknown-evidence" or
                "unknown-source"));
        var summary = Assert.Single(telemetry.AnswerQualitySummaries);
        Assert.False(summary.Grounded);
        Assert.Equal(3, summary.UnsupportedAssertionRejectionCount);
        Assert.Equal(0.0, summary.EvidenceCitationCoverageRatio);
        Assert.Empty(summary.SourceClaimConfidenceValues);
    }

    [Fact]
    public async Task AnswerAsync_RecordsContextOmissionsAndEstimatedTokenBudgetExhaustion()
    {
        var telemetry = new RecordingTelemetry();
        var fixture = new Fixture(
            contextCompiler: new OmittingContextCompiler(
                "Claim omitted because the estimated context-token budget would be exceeded.",
                "Claim omitted because the maximum claim count was reached."),
            telemetry: telemetry);

        var result = await fixture.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
        Assert.Equal((2, true), Assert.Single(telemetry.ContextQuality));
    }

    [Theory]
    [InlineData(0, 4096)]
    [InlineData(4096, 0)]
    [InlineData(4096, 4096)]
    public async Task AnswerAsync_RejectsInvalidModelAllowanceBeforeCallingPlm(
        int maxInputTokens,
        int maxOutputTokens)
    {
        var fixture = new Fixture(modelConfiguration: new ModelConfiguration(
            "model-1", "test", "test-model", "test-deployment", maxOutputTokens, maxInputTokens));

        var result = await fixture.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "model-input-budget-not-configured" &&
            issue.Message == "The answer model input budget is not configured.");
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_RejectsMissingInputAllowanceBeforeCallingPlm()
    {
        var fixture = new Fixture(modelConfiguration: new ModelConfiguration(
            "model-1", "test", "test-model", "test-deployment", 256, 0));

        var result = await fixture.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Contains(result.Issues, issue => issue.Code == "model-input-budget-not-configured");
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_AbstainsBeforePlmWhenFixedPromptLeavesNoContextBudget()
    {
        var request = Request();
        var prompt = new SourceControlledPromptCatalog().GetRequired("engineering-impact", "v1");
        var promptAssembler = new PromptAssembler();
        var fixedPromptTokens = promptAssembler.EstimateFixedPromptTokens(request, prompt);
        var maxInputTokens = Enumerable.Range(fixedPromptTokens + 1, fixedPromptTokens)
            .First(maxInput => ModelInputTokenBudget.CalculateContextAllowance(
                maxInput, 1, fixedPromptTokens) == 0);
        var contextCompiler = new TrackingContextCompiler();
        var fixture = new Fixture(
            modelConfiguration: new ModelConfiguration(
                "model-1", "test", "test-model", "test-deployment", 1, maxInputTokens),
            contextCompiler: contextCompiler,
            telemetry: new RecordingTelemetry());

        var result = await fixture.Service.AnswerAsync(
            request, Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Abstain, result.Disposition);
        Assert.Equal(0, fixture.Gateway.CallCount);
        Assert.Contains(result.Issues, issue => issue.Code == "model-input-budget-exceeded");
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, contextCompiler.CallCount);
        Assert.Equal((0, true), Assert.Single(((RecordingTelemetry)fixture.Telemetry).ContextQuality));
    }

    [Fact]
    public async Task AnswerAsync_AbstainsWhenAssembledEstimateExceedsAllowanceWithoutCallingModel()
    {
        var telemetry = new RecordingTelemetry();
        var fixture = new Fixture(
            promptAssembler: new OverestimatingPromptAssembler(),
            telemetry: telemetry);

        var result = await fixture.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Abstain, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "model-input-budget-exceeded" &&
            issue.Message == "The answer prompt exceeds the configured model input budget.");
        Assert.Equal(0, fixture.Gateway.CallCount);
        Assert.Contains((0, true), telemetry.ContextQuality);
    }

    [Fact]
    public async Task AnswerAsync_SanitizesPromptCatalogAndAssemblerErrors()
    {
        var catalogFailure = new Fixture(promptCatalog: new StubPromptCatalog(
            (_, _) => throw new InvalidDataException("private catalog detail")));
        var catalogResult = await catalogFailure.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        AssertSanitizedPromptFailure(catalogResult);
        Assert.Equal(0, Assert.IsType<TrackingContextCompiler>(catalogFailure.ContextCompiler).CallCount);
        Assert.Equal(0, catalogFailure.Gateway.CallCount);

        var assemblerFailure = new Fixture(promptAssembler: new ThrowingPromptAssembler());
        var assemblerResult = await assemblerFailure.Service.AnswerAsync(
            Request(), Authorization(), RequestContext(), CancellationToken.None);

        AssertSanitizedPromptFailure(assemblerResult);
        Assert.Equal(0, assemblerFailure.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_ClarifiesUnresolvedSubjectWithoutRetrievingEvidenceOrCallingModel()
    {
        var fixture = new Fixture(resolution: new EntityResolutionResult(
            EntityResolutionDisposition.Unresolved,
            null,
            [],
            ["No exact subject was found."]));

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Clarify, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
        Assert.Equal(0, fixture.ScopePlanner.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_ClarifiesUnsupportedQuestionBeforeCallingPlm()
    {
        var fixture = new Fixture();
        var request = new ImpactAnswerRequest("investigation-1", "Describe requirement REQ-123.");

        var result = await fixture.Service.AnswerAsync(
            request,
            Authorization(),
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Clarify, result.Disposition);
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Theory]
    [InlineData("SAP")]
    [InlineData("Windchill")]
    [InlineData("Teamcenter")]
    public async Task AnswerAsync_DoesNotAnswerWithAnUnfilteredApplicationFollowUp(string application)
    {
        var fixture = new Fixture();
        var now = DateTimeOffset.UtcNow;
        var state = new ConversationState(
            1,
            "conversation-1",
            "investigation-1",
            1,
            ["part-17"],
            [new ValidatedEntityReference("part-17", "Part", "Windchill")],
            new ConversationApplicationFilters([], []),
            [],
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            ConversationOutputDimension.Impact,
            "turn-1",
            "context-1",
            1,
            "source-1",
            "ontology-1",
            ConversationStateOwnerFingerprint.Create(Authorization().Scope),
            null,
            ConversationTurnDisposition.Answer,
            now.AddMinutes(-2),
            now.AddMinutes(-1),
            now.AddHours(1));
        var request = new ImpactAnswerRequest(
            "investigation-1",
            $"What about only {application} impacts?",
            "conversation-1")
        {
            PreviousConversationState = state,
            ParentTurnId = "turn-1"
        };

        var result = await fixture.Service.AnswerAsync(
            request,
            Authorization(),
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Clarify, result.Disposition);
        Assert.Contains(result.Issues, issue =>
            issue.Code == "target-application-filter-not-supported" &&
            issue.Message.Contains(application, StringComparison.Ordinal));
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_ReresolvesAValidatedFollowUpSubjectAndRetrievesFreshEvidence()
    {
        var fixture = new Fixture(conversationStateLifetime: TimeSpan.FromHours(2));
        var now = DateTimeOffset.UtcNow;
        var state = new ConversationState(
            1,
            "conversation-1",
            "investigation-1",
            1,
            ["REQ-123"],
            [new ValidatedEntityReference("REQ-123", "Requirement", "Codebeamer")],
            new ConversationApplicationFilters([], []),
            [],
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            ConversationOutputDimension.Impact,
            "turn-1",
            "context-1",
            1,
            "source-1",
            "ontology-1",
            ConversationStateOwnerFingerprint.Create(Authorization().Scope),
            null,
            ConversationTurnDisposition.Answer,
            now.AddMinutes(-2),
            now.AddMinutes(-1),
            now.AddHours(1));
        var request = new ImpactAnswerRequest(
            "investigation-1",
            "Why is it impacted?",
            "conversation-1")
        {
            PreviousConversationState = state,
            ParentTurnId = "turn-1"
        };
        var requestContext = RequestContext() with { TurnId = "turn-2" };

        var result = await fixture.Service.AnswerAsync(
            request,
            Authorization(),
            requestContext,
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Answer, result.Disposition);
        Assert.Equal("REQ-123", fixture.Resolver.LastInterpretation?.CandidateEntityId);
        Assert.Equal("Why is it impacted?", fixture.Resolver.LastInterpretation?.OriginalQuestion);
        Assert.Equal(1, fixture.Resolver.CallCount);
        Assert.Equal(1, fixture.EvidenceSource.CallCount);
        Assert.Equal(1, fixture.ScopePlanner.ConversationCallCount);
        Assert.Equal(1, fixture.Gateway.CallCount);
        Assert.Equal("turn-2", result.ContinuationState?.PreviousTurnId);
        Assert.Equal(2, result.ContinuationState?.StateVersion);
        Assert.Equal("source-v1", result.ContinuationState?.SourceVersion);
        Assert.Equal("ontology-v1", result.ContinuationState?.OntologyVersion);
    }

    [Fact]
    public async Task AnswerAsync_DoesNotUseContinuationStateFromAnotherAuthorizedOwner()
    {
        var fixture = new Fixture();
        var state = new ConversationState(
            1,
            "conversation-1",
            "investigation-1",
            1,
            ["REQ-123"],
            [new ValidatedEntityReference("REQ-123", "Requirement", "Codebeamer")],
            new ConversationApplicationFilters([], []),
            [],
            new ImpactScope(new HashSet<string>(), 3, new HashSet<string>(), null),
            ConversationOutputDimension.Impact,
            "turn-1",
            "context-1",
            null,
            "source-v1",
            "ontology-v1",
            "different-owner",
            null,
            ConversationTurnDisposition.Answer,
            DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow.AddHours(1));
        var request = new ImpactAnswerRequest("investigation-1", "Why is it impacted?", "conversation-1")
        {
            ParentTurnId = "turn-1",
            PreviousConversationState = state
        };

        var result = await fixture.Service.AnswerAsync(
            request,
            Authorization(),
            RequestContext() with { TurnId = "turn-2" },
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Clarify, result.Disposition);
        Assert.Equal("validated-subject-required", Assert.Single(result.Issues).Code);
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_RejectsMissingInvestigationBeforeCallingPlm()
    {
        var fixture = new Fixture();

        await Assert.ThrowsAsync<ArgumentException>(() =>
            fixture.Service.AnswerAsync(
                new ImpactAnswerRequest("", "What is impacted if R-123 changes?"),
                Authorization(),
                RequestContext(),
                CancellationToken.None));

        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_AbstainsOnEmptyEvidenceWithoutCallingModel()
    {
        var fixture = new Fixture(evidence: EmptyEvidence());

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Abstain, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.NotEmpty(result.Issues);
        Assert.Equal(0, fixture.Gateway.CallCount);
    }

    [Fact]
    public async Task AnswerAsync_RejectsMalformedModelJson()
    {
        var fixture = new Fixture(modelContent: "{not-json");

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Contains(result.Issues, issue => issue.Code == "invalid-model-output");
    }

    [Fact]
    public async Task AnswerAsync_ReportsModelProviderFailureExplicitly()
    {
        var fixture = new Fixture(modelFailure: new HttpRequestException("provider unavailable"));

        var result = await fixture.Service.AnswerAsync(Request(), Authorization(), RequestContext(), CancellationToken.None);

        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Contains(result.Issues, issue => issue.Code == "model-provider-failed");
    }

    [Fact]
    public async Task AnswerAsync_DoesNotResolveOrRetrieveWhenAuthorizationIsExpired()
    {
        var fixture = new Fixture();
        var expiredAuthorization = Authorization() with
        {
            ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1)
        };

        var result = await fixture.Service.AnswerAsync(
            Request(),
            expiredAuthorization,
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(AnswerDisposition.Deny, result.Disposition);
        Assert.Equal("not-evaluated", result.SemanticSupportStatus);
        Assert.Equal(0, fixture.Resolver.CallCount);
        Assert.Equal(0, fixture.ScopePlanner.CallCount);
        Assert.Equal(0, fixture.EvidenceSource.CallCount);
    }

    private static ImpactAnswerRequest Request() =>
        new("investigation-1", "What impacts if REQ-123 changes?", "conversation-1");

    [Theory]
    [InlineData(AnswerDisposition.Answer)]
    [InlineData(AnswerDisposition.Clarify)]
    [InlineData(AnswerDisposition.Abstain)]
    [InlineData(AnswerDisposition.Deny)]
    [InlineData(AnswerDisposition.Failed)]
    public void ImpactAnswerResult_SerializesSemanticSupportAsNotEvaluated(AnswerDisposition disposition)
    {
        var result = new ImpactAnswerResult(
            "investigation-1",
            RequestContext(),
            disposition,
            null,
            [],
            [],
            [],
            null);

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(
            result,
            new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        Assert.Equal(
            "not-evaluated",
            document.RootElement.GetProperty("semanticSupportStatus").GetString());
    }

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", null, "conversation-1");

    private static AuthorizationContext Authorization()
    {
        var scope = new AuthorizationScope(
            "tenant-1",
            "subject-1",
            "policy-v1",
            "decision-1",
            new HashSet<string>(
                ["investigation:resolve-entity", "investigation:read-impact-evidence"],
                StringComparer.Ordinal),
            DateTimeOffset.UtcNow.AddMinutes(1));
        return new AuthorizationContext(scope, "ticket-secret", scope.DecisionExpiresAt);
    }

    private static EvidenceRetrievalResult EmptyEvidence() =>
        new(
            "investigation-1",
            [],
            [],
            [],
            [],
            "source-v1",
            "ontology-v1",
            "decision-1",
            "request-1",
            "trace-1");

    private sealed class Fixture
    {
        public Fixture(
            EntityResolutionResult? resolution = null,
            EvidenceRetrievalResult? evidence = null,
            string? modelContent = null,
            Exception? modelFailure = null,
            ModelConfiguration? modelConfiguration = null,
            IPromptCatalog? promptCatalog = null,
            IPromptAssembler? promptAssembler = null,
            IContextCompiler? contextCompiler = null,
            RecordingTelemetry? telemetry = null,
            TimeSpan? conversationStateLifetime = null)
        {
            Resolver = new StubEntityResolver(resolution);
            ScopePlanner = new TrackingScopePlanner();
            EvidenceSource = new StubEvidenceSource(evidence ?? Evidence());
            Gateway = new StubModelGateway(modelContent ?? ValidModelContent, modelFailure);
            ContextCompiler = contextCompiler ?? new TrackingContextCompiler();
            Telemetry = telemetry ?? new RecordingTelemetry();
            Service = new ImpactAnswerService(
                new QuestionInterpreter(),
                new ConversationTurnInterpreter(),
                Resolver,
                ScopePlanner,
                EvidenceSource,
                ContextCompiler,
                promptCatalog ?? new SourceControlledPromptCatalog(),
                promptAssembler ?? new PromptAssembler(),
                Gateway,
                new AnswerCandidateParser(),
                new AnswerValidator(),
                modelConfiguration ?? new ModelConfiguration(
                    "model-1", "test", "test-model", "test-deployment", 256, 8192),
                telemetry: Telemetry,
                conversationStateRetention: conversationStateLifetime is { } lifetime
                    ? new ConversationStateRetentionOptions { LifetimeSeconds = (int)lifetime.TotalSeconds }
                    : null);
        }

        public StubEntityResolver Resolver { get; }
        public TrackingScopePlanner ScopePlanner { get; }
        public StubEvidenceSource EvidenceSource { get; }
        public StubModelGateway Gateway { get; }
        public IContextCompiler ContextCompiler { get; }
        public RecordingTelemetry Telemetry { get; }
        public ImpactAnswerService Service { get; }
    }

    private sealed class OmittingContextCompiler(params string[] reasons) : IContextCompiler
    {
        private readonly ContextCompiler _inner = new();

        public ContextCompilationResult Compile(ContextCompilationInput input)
        {
            var result = _inner.Compile(input);
            return result.Package is null
                ? result
                : result with
                {
                    Package = result.Package with
                    {
                        Omissions = reasons
                            .Select((reason, index) => new ContextOmission($"private-claim-{index}", reason))
                            .ToArray()
                    }
                };
        }
    }

    private sealed class RecordingTelemetry : IAiRuntimeTelemetry
    {
        public List<(int OmissionCount, bool BudgetExhausted)> ContextQuality { get; } = [];
        public List<AnswerQualitySummary> AnswerQualitySummaries { get; } = [];

        public IRuntimeTelemetryStage StartStage(
            string stage,
            RuntimeRequestContext requestContext,
            string? investigationId = null) =>
            NullAiRuntimeTelemetry.Instance.StartStage(stage, requestContext, investigationId);

        public void RecordRequestOutcome(string disposition)
        {
        }

        public void RecordValidationDisposition(string disposition)
        {
        }

        public void RecordModelUsage(
            string provider,
            string modelConfigurationId,
            int? inputTokens,
            int? outputTokens)
        {
        }

        public void RecordContextQuality(int omissionCount, bool budgetExhausted) =>
            ContextQuality.Add((omissionCount, budgetExhausted));

        public void RecordAnswerQuality(AnswerQualitySummary summary) =>
            AnswerQualitySummaries.Add(summary);

        public void RecordConversationTurn(ConversationTurnTelemetry summary)
        {
        }

        public void RecordConversationStateInvalidation(ConversationStateInvalidationReason reason)
        {
        }

        public void RecordConversationRetrieval(bool followUp)
        {
        }

        public void RecordConversationTurnDisposition(AnswerDisposition disposition)
        {
        }
    }

    private static void AssertSanitizedPromptFailure(ImpactAnswerResult result)
    {
        Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        var issue = Assert.Single(result.Issues);
        Assert.Equal("prompt-unavailable", issue.Code);
        Assert.Equal("The approved answer prompt is unavailable.", issue.Message);
        Assert.DoesNotContain("private", issue.Message, StringComparison.OrdinalIgnoreCase);
    }

    private sealed class TrackingContextCompiler : IContextCompiler
    {
        private readonly ContextCompiler _inner = new();

        public int CallCount { get; private set; }
        public ContextCompilationInput? LastInput { get; private set; }
        public ContextCompilationResult? LastResult { get; private set; }

        public ContextCompilationResult Compile(ContextCompilationInput input)
        {
            CallCount++;
            LastInput = input;
            LastResult = _inner.Compile(input);
            return LastResult;
        }
    }

    private sealed class StubPromptCatalog(
        Func<string, string, PromptBundle> getRequired) : IPromptCatalog
    {
        public PromptBundle GetRequired(string id, string version) => getRequired(id, version);
    }

    private sealed class ThrowingPromptAssembler : IPromptAssembler
    {
        public int EstimateFixedPromptTokens(ImpactAnswerRequest request, PromptBundle prompt) => 0;

        public ModelRequest Assemble(
            ImpactAnswerRequest request,
            ContextPackage context,
            PromptBundle prompt,
            ModelConfiguration configuration) =>
            throw new ArgumentException("private assembler detail");
    }

    private sealed class OverestimatingPromptAssembler : IPromptAssembler
    {
        private readonly PromptAssembler _inner = new();

        public int EstimateFixedPromptTokens(ImpactAnswerRequest request, PromptBundle prompt) =>
            _inner.EstimateFixedPromptTokens(request, prompt);

        public ModelRequest Assemble(
            ImpactAnswerRequest request,
            ContextPackage context,
            PromptBundle prompt,
            ModelConfiguration configuration) =>
            _inner.Assemble(request, context, prompt, configuration) with
            {
                EstimatedInputTokens = int.MaxValue
            };
    }

    private sealed class TrackingScopePlanner : IScopePlanner
    {
        private readonly ScopePlanner _inner = new();

        public int CallCount { get; private set; }
        public int ConversationCallCount { get; private set; }

        public ScopePlanningResult Plan(
            ConversationTurnInterpretation turn,
            ConversationState? priorState,
            ResolvedEntity subject,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext)
        {
            ConversationCallCount++;
            return _inner.Plan(turn, priorState, subject, authorization, requestContext);
        }

        public ScopePlanningResult Plan(
            QuestionInterpretation interpretation,
            ResolvedEntity subject,
            AuthorizationScope authorization,
            RuntimeRequestContext requestContext)
        {
            CallCount++;
            return _inner.Plan(interpretation, subject, authorization, requestContext);
        }
    }

    private const string ValidModelContent =
        """{"schemaVersion":"answer-v1","summary":"REQ-123 affects P-1.","impacts":[{"claimId":"relationship:relationship-1","explanation":"REQ-123 affects P-1.","evidenceIds":["evidence-1"],"sourceIds":["provenance-1"]}],"warnings":[]}""";

    private static EvidenceRetrievalResult Evidence() =>
        new(
            "investigation-1",
            [
                new RelationshipEvidence(
                    "relationship-1",
                    "REQ-123",
                    "P-1",
                    "depends-on",
                    "REQ-123 affects P-1.",
                    ["evidence-1"])
            ],
            [],
            [],
            [new EvidenceSourceReference(
                "evidence-1",
                "relationship",
                "plm",
                "record-1",
                "revision-1",
                null,
                null,
                "provenance-1",
                "decision-1",
                CitationId: "citation-1",
                Authority: "source-authoritative",
                Provider: "plm")],
            "source-v1",
            "ontology-v1",
            "decision-1",
            "request-1",
            "trace-1");

    private sealed class StubEntityResolver(EntityResolutionResult? result = null) : IEngineeringEntityResolver
    {
        public int CallCount { get; private set; }
        public AuthorizationContext? Authorization { get; private set; }
        public QuestionInterpretation? LastInterpretation { get; private set; }

        public Task<EntityResolutionResult> ResolveAsync(
            string investigationId,
            QuestionInterpretation interpretation,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Authorization = authorization;
            LastInterpretation = interpretation;
            return Task.FromResult(result ?? new EntityResolutionResult(
                EntityResolutionDisposition.Resolved,
                new ResolvedEntity("plm", "Requirement", "REQ-123", "Requirement REQ-123"),
                ["REQ-123"],
                []));
        }
    }

    private sealed class StubEvidenceSource(EvidenceRetrievalResult result) : IEngineeringEvidenceSource
    {
        public int CallCount { get; private set; }
        public AuthorizationContext? Authorization { get; private set; }

        public Task<EvidenceRetrievalResult> RetrieveImpactAsync(
            ImpactEvidenceQuery query,
            CancellationToken cancellationToken)
        {
            CallCount++;
            Authorization = query.Authorization;
            return Task.FromResult(result);
        }
    }

    private sealed class StubModelGateway(string content, Exception? failure) : IModelGateway
    {
        public int CallCount { get; private set; }

        public Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken)
        {
            CallCount++;
            if (failure is not null)
            {
                throw failure;
            }

            return Task.FromResult(new ModelResponse(
                request.RequestContext,
                content,
                "test",
                "test-model",
                null,
                10,
                10,
                TimeSpan.FromMilliseconds(1)));
        }
    }
}
