using System.Diagnostics;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Telemetry;

public sealed record AnswerQualitySummary(
    bool Grounded,
    int UnsupportedAssertionRejectionCount,
    double? EvidenceCitationCoverageRatio,
    IReadOnlyList<double> SourceClaimConfidenceValues);

public enum ConversationReferenceResolution
{
    None,
    Explicit,
    Inherited,
    Ambiguous,
    Unavailable
}

public enum ConversationStateInvalidationReason
{
    OwnerMismatch,
    InvestigationMismatch,
    ConversationMismatch,
    ParentTurnMismatch,
    Expired,
    UnsupportedDisposition,
    SnapshotChanged,
    SourceVersionChanged,
    OntologyVersionChanged,
    SubjectUnavailable
}

public sealed record ConversationTurnTelemetry(
    ConversationTurnType TurnType,
    ConversationReferenceResolution ReferenceResolution,
    int InheritedReferenceCount,
    bool FilterChanged,
    bool ClarificationRequired,
    bool ParentTurnCorrelated);

public interface IAiRuntimeTelemetry
{
    IRuntimeTelemetryStage StartStage(
        string stage,
        RuntimeRequestContext requestContext,
        string? investigationId = null);

    void RecordRequestOutcome(string disposition);

    void RecordValidationDisposition(string disposition);

    void RecordModelUsage(
        string provider,
        string modelConfigurationId,
        int? inputTokens,
        int? outputTokens);

    void RecordContextQuality(int omissionCount, bool budgetExhausted);

    void RecordSourceEvidenceOmissions(int omissionCount);

    void RecordSourceEvidenceIndexStatus(SourceEvidenceIndexState status);

    void RecordSourceEvidenceIndexRevision();

    void RecordAnswerQuality(AnswerQualitySummary summary);

    void RecordConversationTurn(ConversationTurnTelemetry summary);

    void RecordConversationStateInvalidation(ConversationStateInvalidationReason reason);

    void RecordConversationRetrieval(bool followUp);

    void RecordConversationTurnDisposition(AnswerDisposition disposition);
}

public interface IRuntimeTelemetryStage : IDisposable
{
    void SetDisposition(string disposition);

    void SetFailure(string category);

    void SetTag(string name, object? value);
}

public sealed class NullAiRuntimeTelemetry : IAiRuntimeTelemetry
{
    public static NullAiRuntimeTelemetry Instance { get; } = new();

    private NullAiRuntimeTelemetry()
    {
    }

    public IRuntimeTelemetryStage StartStage(
        string stage,
        RuntimeRequestContext requestContext,
        string? investigationId = null) =>
        NullStage.Instance;

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

    public void RecordContextQuality(int omissionCount, bool budgetExhausted)
    {
    }

    public void RecordSourceEvidenceOmissions(int omissionCount)
    {
    }

    public void RecordSourceEvidenceIndexStatus(SourceEvidenceIndexState status)
    {
    }

    public void RecordSourceEvidenceIndexRevision()
    {
    }

    public void RecordAnswerQuality(AnswerQualitySummary summary)
    {
    }

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

    private sealed class NullStage : IRuntimeTelemetryStage
    {
        public static NullStage Instance { get; } = new();

        public void SetDisposition(string disposition)
        {
        }

        public void SetFailure(string category)
        {
        }

        public void SetTag(string name, object? value)
        {
        }

        public void Dispose()
        {
        }
    }
}
