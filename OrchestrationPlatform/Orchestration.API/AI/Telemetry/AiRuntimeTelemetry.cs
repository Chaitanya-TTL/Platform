using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Text.RegularExpressions;
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
