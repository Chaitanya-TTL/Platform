using Orchestration.API.Engineering.Contracts;

namespace Orchestration.API.Engineering.Adapters.Teamcenter;

public interface ITeamcenterFailureClassifier
{
    StructuredError Classify(string? processOutput, int? exitCode, bool outputExists, Exception? exception = null);
}

public sealed class TeamcenterFailureClassifier : ITeamcenterFailureClassifier
{
    public StructuredError Classify(string? processOutput, int? exitCode, bool outputExists, Exception? exception = null)
    {
        var text = processOutput ?? string.Empty;
        var now = DateTimeOffset.UtcNow;

        if (exception is OperationCanceledException)
            return Error("teamcenter-cancelled", EngineeringStage.Cancellation, "Teamcenter extraction was cancelled.", false, now);
        if (exception is TimeoutException)
            return Error("teamcenter-timeout", EngineeringStage.Timeout, "Teamcenter extraction timed out.", true, now);
        if (exception is FileNotFoundException or DirectoryNotFoundException)
            return Error("teamcenter-runtime-unavailable", EngineeringStage.TeamcenterSession, "The Teamcenter runtime entry point is unavailable.", false, now);

        if (Contains(text, "invalid credentials", "login failed", "authentication failed", "not authorized"))
            return Error("teamcenter-authentication-required", EngineeringStage.TeamcenterSession, "Teamcenter authentication was rejected.", false, now);
        if (Contains(text, "could not find item", "failed to load item", "no revisions found"))
            return Error("teamcenter-item-not-found", EngineeringStage.TeamcenterResolution, "The requested Teamcenter Item ID could not be resolved.", false, now);
        if (Contains(text, "saved query", "query unavailable", "no saved queries found"))
            return Error("teamcenter-query-unavailable", EngineeringStage.TeamcenterResolution, "The required Teamcenter query capability is unavailable.", false, now);
        if (Contains(text, "build failed", "compilation failed", "javac"))
            return Error("teamcenter-build-failed", EngineeringStage.TeamcenterSession, "The Teamcenter Java client build failed.", true, now);
        if (Contains(text, "failed to open bom window", "teamcenter session", "connection refused", "serviceexception"))
            return Error("teamcenter-session-failed", EngineeringStage.TeamcenterSession, "The Teamcenter session or BOM window operation failed.", true, now);
        if (!outputExists)
            return Error("teamcenter-output-missing", EngineeringStage.TeamcenterStructureExtraction, "Teamcenter did not produce an attributable extraction output.", true, now);
        if (exitCode is not null and not 0)
            return Error("unknown-process-failure", EngineeringStage.Extraction, "The Teamcenter process failed without a recognized safe classification.", true, now);

        return Error("unknown-process-failure", EngineeringStage.Extraction, "Teamcenter extraction failed without a recognized safe classification.", true, now);
    }

    private static bool Contains(string text, params string[] values) =>
        values.Any(value => text.Contains(value, StringComparison.OrdinalIgnoreCase));

    private static StructuredError Error(string code, EngineeringStage stage, string message, bool retryable, DateTimeOffset now) =>
        new(code, EngineeringSource.Teamcenter, stage, message, message, retryable, now);
}
