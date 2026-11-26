using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Telemetry;
using Microsoft.Extensions.Options;

namespace Orchestration.API.AI.Telemetry;

public sealed class AiRuntimeTelemetry : IAiRuntimeTelemetry
{
    public const string ActivitySourceName = "Lattice.AI.Runtime";
    public const string MeterName = "Lattice.AI.Runtime";

    private static readonly HashSet<string> StageNames =
    [
        "answer.request",
        "authorization",
        "entity-resolution",
        "scope-planning",
        "plm-retrieval",
        "source-evidence-retrieval",
        "source-evidence-projection",
        "source-evidence-segmentation",
        "source-evidence-embedding",
        "source-evidence-retrieval-exact",
        "source-evidence-retrieval-lexical",
        "source-evidence-retrieval-vector",
        "source-evidence-retrieval-hybrid",
        "source-evidence-omission",
        "context-compilation",
        "prompt",
        "prompt-assembly",
        "model-generation",
        "validation"
    ];

    private static readonly HashSet<string> Dispositions =
    [
        "answer",
        "clarify",
        "abstain",
        "deny",
        "failed",
        "cancelled",
        "ready",
        "empty",
        "insufficient-evidence",
        "accept",
        "reject",
        "authorized",
        "unavailable",
        "unsupported",
        "denied",
        "resolved",
        "ambiguous",
        "unresolved",
        "completed"
    ];

    private static readonly ActivitySource ActivitySource = new(ActivitySourceName);
    private static readonly Regex PascalCaseBoundary = new(
        @"(?<=[a-z0-9])(?=[A-Z])",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> RequestOutcomes =
        Meter.CreateCounter<long>("lattice.ai.runtime.request.outcomes");
    private static readonly Histogram<double> StageDuration =
        Meter.CreateHistogram<double>("lattice.ai.runtime.stage.duration", "ms");
    private static readonly Counter<long> ValidationDispositions =
        Meter.CreateCounter<long>("lattice.ai.runtime.validation.dispositions");
    private static readonly Counter<long> ContextOmissions =
        Meter.CreateCounter<long>("lattice.ai.runtime.context.omissions", "omissions");
    private static readonly Counter<long> ContextBudgetExhaustions =
        Meter.CreateCounter<long>("lattice.ai.runtime.context.budget_exhaustions");
    private static readonly Counter<long> SourceEvidenceOmissions =
        Meter.CreateCounter<long>("lattice.ai.runtime.source_evidence.omissions", "omissions");
    private static readonly Counter<long> SourceEvidenceIndexStatuses =
        Meter.CreateCounter<long>("lattice.ai.runtime.source_evidence.index.statuses");
    private static readonly Counter<long> SourceEvidenceIndexRevisions =
        Meter.CreateCounter<long>("lattice.ai.runtime.source_evidence.index.revisions");
    private static readonly Counter<long> GroundedAnswers =
        Meter.CreateCounter<long>("lattice.ai.runtime.answer.grounded");
    private static readonly Counter<long> UnsupportedAssertionRejections =
        Meter.CreateCounter<long>("lattice.ai.runtime.answer.unsupported_assertion_rejections");
    private static readonly Histogram<double> EvidenceCitationCoverage =
        Meter.CreateHistogram<double>("lattice.ai.runtime.answer.evidence_citation_coverage", "ratio");
    private static readonly Histogram<double> SourceClaimConfidence =
        Meter.CreateHistogram<double>("lattice.ai.runtime.answer.source_claim_confidence", "score");
    private static readonly Counter<long> ModelTokens =
        Meter.CreateCounter<long>("lattice.ai.runtime.model.tokens", "tokens");
    private static readonly Counter<long> Failures =
        Meter.CreateCounter<long>("lattice.ai.runtime.failures");
    private static readonly Counter<long> ConversationTurnTypes =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.turns");
    private static readonly Counter<long> ConversationReferenceResolutions =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.reference_resolutions");
    private static readonly Histogram<long> InheritedReferenceCount =
        Meter.CreateHistogram<long>("lattice.ai.runtime.conversation.inherited_reference_count", "references");
    private static readonly Counter<long> ConversationFilterChanges =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.filter_changes");
    private static readonly Counter<long> ConversationClarifications =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.clarifications");
    private static readonly Counter<long> ConversationStateInvalidations =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.state_invalidations");
    private static readonly Counter<long> ConversationFollowUpRetrievals =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.follow_up_retrievals");
    private static readonly Counter<long> ConversationParentCorrelations =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.parent_correlations");
    private static readonly Counter<long> ConversationDispositions =
        Meter.CreateCounter<long>("lattice.ai.runtime.conversation.dispositions");

    private readonly AiRuntimeTelemetryOptions _options;

    public AiRuntimeTelemetry(IOptions<AiRuntimeTelemetryOptions>? options = null)
    {
        _options = options?.Value ?? new AiRuntimeTelemetryOptions();
    }

    public IRuntimeTelemetryStage StartStage(
        string stage,
        RuntimeRequestContext requestContext,
        string? investigationId = null)
    {
        ArgumentNullException.ThrowIfNull(requestContext);
        var stageName = NormalizeStage(stage);
        var activity = ActivitySource.StartActivity(stageName, ActivityKind.Internal);
        activity?.SetTag("lattice.request.id", requestContext.RequestId);
        activity?.SetTag("lattice.trace.id", requestContext.TraceId);
        if (_options.IncludeInvestigationIdentifier && !string.IsNullOrWhiteSpace(investigationId))
        {
            activity?.SetTag("lattice.investigation.id", investigationId);
        }

        return new RuntimeTelemetryStage(stageName, activity, _options);
    }

    public void RecordRequestOutcome(string disposition) =>
        RequestOutcomes.Add(
            1,
            new KeyValuePair<string, object?>("disposition", NormalizeDisposition(disposition)));

    public void RecordValidationDisposition(string disposition) =>
        ValidationDispositions.Add(
            1,
            new KeyValuePair<string, object?>("disposition", NormalizeDisposition(disposition)));

    public void RecordModelUsage(
        string provider,
        string modelConfigurationId,
        int? inputTokens,
        int? outputTokens)
    {
        var tags = new TagList
        {
            { "model.provider", NormalizeModelProvider(provider) },
            { "model.configuration_id", modelConfigurationId },
            { "model.usage_type", "input" }
        };
        if (inputTokens is >= 0)
        {
            ModelTokens.Add(inputTokens.Value, tags);
        }
        if (outputTokens is >= 0)
        {
            var outputTags = new TagList
            {
                { "model.provider", NormalizeModelProvider(provider) },
                { "model.configuration_id", modelConfigurationId },
                { "model.usage_type", "output" }
            };
            ModelTokens.Add(outputTokens.Value, outputTags);
        }
    }

    public void RecordContextQuality(int omissionCount, bool budgetExhausted)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(omissionCount);

        if (omissionCount > 0)
        {
            ContextOmissions.Add(omissionCount);
        }

        if (budgetExhausted)
        {
            ContextBudgetExhaustions.Add(1);
        }
    }

    public void RecordSourceEvidenceOmissions(int omissionCount)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(omissionCount);

        if (omissionCount > 0)
        {
            SourceEvidenceOmissions.Add(omissionCount);
        }
    }

    public void RecordSourceEvidenceIndexStatus(SourceEvidenceIndexState status)
    {
        if (!Enum.IsDefined(status))
        {
            throw new ArgumentOutOfRangeException(nameof(status), status, "Unsupported source evidence index status.");
        }

        SourceEvidenceIndexStatuses.Add(
            1,
            new KeyValuePair<string, object?>("status", status.ToString().ToLowerInvariant()));
    }

    public void RecordSourceEvidenceIndexRevision() =>
        SourceEvidenceIndexRevisions.Add(1);

    public void RecordAnswerQuality(AnswerQualitySummary summary)
    {
        ArgumentNullException.ThrowIfNull(summary);
        ArgumentOutOfRangeException.ThrowIfNegative(summary.UnsupportedAssertionRejectionCount);
        ArgumentNullException.ThrowIfNull(summary.SourceClaimConfidenceValues);

        if (summary.Grounded)
        {
            GroundedAnswers.Add(1);
        }

        if (summary.UnsupportedAssertionRejectionCount > 0)
        {
            UnsupportedAssertionRejections.Add(summary.UnsupportedAssertionRejectionCount);
        }

        if (summary.EvidenceCitationCoverageRatio is { } coverage && double.IsFinite(coverage))
        {
            if (coverage is < 0 or > 1)
            {
                throw new ArgumentOutOfRangeException(
                    nameof(summary),
                    "Evidence citation coverage must be between zero and one.");
            }

            EvidenceCitationCoverage.Record(coverage);
        }

        foreach (var confidence in summary.SourceClaimConfidenceValues)
        {
            if (double.IsFinite(confidence))
            {
                if (confidence is < 0 or > 1)
                {
                    throw new ArgumentOutOfRangeException(
                        nameof(summary),
                        "Source claim confidence values must be between zero and one.");
                }

                SourceClaimConfidence.Record(confidence);
            }
        }
    }

    public void RecordConversationTurn(ConversationTurnTelemetry summary)
    {
        ArgumentNullException.ThrowIfNull(summary);
        ArgumentOutOfRangeException.ThrowIfNegative(summary.InheritedReferenceCount);
        var inheritedCount = Math.Min(summary.InheritedReferenceCount, 10);
        ConversationTurnTypes.Add(
            1,
            new KeyValuePair<string, object?>("turn.type", NormalizeTurnType(summary.TurnType)));
        ConversationReferenceResolutions.Add(
            1,
            new KeyValuePair<string, object?>("resolution", summary.ReferenceResolution.ToString().ToLowerInvariant()));
        InheritedReferenceCount.Record(inheritedCount);
        ConversationFilterChanges.Add(
            summary.FilterChanged ? 1 : 0,
            new KeyValuePair<string, object?>("changed", summary.FilterChanged));
        ConversationClarifications.Add(
            summary.ClarificationRequired ? 1 : 0,
            new KeyValuePair<string, object?>("required", summary.ClarificationRequired));
        ConversationParentCorrelations.Add(
            summary.ParentTurnCorrelated ? 1 : 0,
            new KeyValuePair<string, object?>("correlated", summary.ParentTurnCorrelated));
    }

    public void RecordConversationStateInvalidation(ConversationStateInvalidationReason reason) =>
        ConversationStateInvalidations.Add(
            1,
            new KeyValuePair<string, object?>("reason", reason.ToString().ToLowerInvariant()));

    public void RecordConversationRetrieval(bool followUp)
    {
        if (followUp) ConversationFollowUpRetrievals.Add(1);
    }

    public void RecordConversationTurnDisposition(AnswerDisposition disposition) =>
        ConversationDispositions.Add(
            1,
            new KeyValuePair<string, object?>("disposition", NormalizeDisposition(disposition.ToString())));

    private static string NormalizeTurnType(ConversationTurnType turnType) =>
        Enum.IsDefined(turnType)
            ? turnType.ToString().Replace(" ", string.Empty, StringComparison.Ordinal).ToLowerInvariant()
            : "unsupported";

    private static string NormalizeStage(string stage) =>
        StageNames.Contains(stage) ? stage : "other";

    private static string NormalizeDisposition(string disposition)
    {
        var normalized = PascalCaseBoundary
            .Replace(disposition, "-")
            .ToLowerInvariant()
            .Replace('_', '-');
        return Dispositions.Contains(normalized) ? normalized : "other";
    }

    private static string NormalizeFailureCategory(string category) =>
        category switch
        {
            "authorization-denied" or
                "authorization-unavailable" or
                "entity-resolution-timeout" or
                "entity-resolution-failed" or
                "plm-retrieval-timeout" or
                "plm-retrieval-failed" or
                "context-compilation-denied" or
                "prompt-unavailable" or
                "model-provider-timeout" or
                "model-provider-failed" or
                "invalid-model-output" or
                "model-input-budget-exceeded" or
                "model-input-budget-not-configured" or
                "correlation-mismatch" => category,
            _ => "other"
        };

    private static string NormalizeModelProvider(string provider) =>
        provider switch
        {
            "azure-openai" => provider,
            "test" => provider,
            _ => "other"
        };

    private sealed class RuntimeTelemetryStage(
        string stage,
        Activity? activity,
        AiRuntimeTelemetryOptions options) : IRuntimeTelemetryStage
    {
        private readonly long _startedAt = Stopwatch.GetTimestamp();
        private string _disposition = "completed";
        private string? _failureCategory;
        private bool _disposed;

        public void SetDisposition(string disposition)
        {
            _disposition = NormalizeDisposition(disposition);
            activity?.SetTag("lattice.stage.disposition", _disposition);
        }

        public void SetFailure(string category)
        {
            _failureCategory = NormalizeFailureCategory(category);
            _disposition = "failed";
            activity?.SetTag("lattice.stage.disposition", _disposition);
            activity?.SetTag("error.type", _failureCategory);
            activity?.SetStatus(ActivityStatusCode.Error, _failureCategory);
            Failures.Add(
                1,
                new KeyValuePair<string, object?>("stage", stage),
                new KeyValuePair<string, object?>("failure.category", _failureCategory));
        }

        public void SetTag(string name, object? value)
        {
            if (activity is not null &&
                value is not null &&
                !AiRuntimeTelemetryPrivacyProcessor.ShouldRemoveTag(name, options))
            {
                activity.SetTag(name, value);
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            var duration = Stopwatch.GetElapsedTime(_startedAt).TotalMilliseconds;
            StageDuration.Record(
                duration,
                new KeyValuePair<string, object?>("stage", stage),
                new KeyValuePair<string, object?>("disposition", _disposition),
                new KeyValuePair<string, object?>("failure.category", _failureCategory ?? "none"));
            activity?.Dispose();
        }
    }
}
