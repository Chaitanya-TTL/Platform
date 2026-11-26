using System.Text.Json;
using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Validation;

namespace Orchestration.API.AI.Adapters;

public sealed class DevelopmentAnswerCandidateParser : IAnswerCandidateParser
{
    private static readonly Regex SummaryPropertyPattern = new(
        """(?:"summary")\s*:\s*(?<value>"(?:\\.|[^"\\])*")""",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public AnswerCandidate Parse(string content)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new JsonException("The model response is empty.");
        }

        try
        {
            using var document = JsonDocument.Parse(UnwrapMarkdownJsonFence(content));
            if (document.RootElement.ValueKind == JsonValueKind.Object &&
                document.RootElement.TryGetProperty("summary", out var summary) &&
                summary.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(summary.GetString()))
            {
                return CreateCandidate(summary.GetString()!);
            }
        }
        catch (JsonException)
        {
            var recoveredSummary = RecoverSummaryFromIncompleteJson(UnwrapMarkdownJsonFence(content));
            if (recoveredSummary is not null)
            {
                return CreateCandidate(recoveredSummary);
            }
        }

        return CreateCandidate(content.Trim());
    }

    private static string UnwrapMarkdownJsonFence(string content)
    {
        var trimmed = content.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal) ||
            !trimmed.EndsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var openingLineEnd = trimmed.IndexOf('\n');
        if (openingLineEnd < 0)
        {
            return trimmed;
        }

        var language = trimmed[3..openingLineEnd].Trim();
        if (language.Length > 0 && !string.Equals(language, "json", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed;
        }

        return trimmed[(openingLineEnd + 1)..^3].Trim();
    }

    private static string? RecoverSummaryFromIncompleteJson(string content)
    {
        var match = SummaryPropertyPattern.Match(content);
        if (!match.Success)
        {
            return null;
        }

        try
        {
            var summary = JsonSerializer.Deserialize<string>(match.Groups["value"].Value);
            return string.IsNullOrWhiteSpace(summary) ? null : summary;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static AnswerCandidate CreateCandidate(string summary) =>
        new(summary, Array.Empty<AnswerImpact>(), Array.Empty<string>());
}

public sealed class DevelopmentAnswerPassThroughValidator(
    ILogger<DevelopmentAnswerPassThroughValidator> logger) : IAnswerValidator
{
    public ValidationResult Validate(
        AnswerCandidate answer,
        ContextPackage context,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext,
        string investigationId)
    {
        logger.LogWarning(
            "Answer validation is bypassed for the local Development runtime.");
        return new ValidationResult(
            ValidationDisposition.Accept,
            Array.Empty<ValidationIssue>());
    }
}
