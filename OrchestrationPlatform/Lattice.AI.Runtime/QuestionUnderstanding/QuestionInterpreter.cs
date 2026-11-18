using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

/// <summary>Narrow Phase 1 engineering-impact question interpretation.</summary>
public sealed class QuestionInterpreter : IQuestionInterpreter
{
    private static readonly Regex ExplicitIdentifier = new(
        @"(?<![A-Z0-9_-])(?:REQ|R)-\d+(?![A-Z0-9_-])",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ImpactIntent = new(
        @"\b(?:impacts?|impacted|affected|downstream|depends?|dependents?|engineering\s+items)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ConditionalChangeIntent = new(
        @"\bwhat\s+happens\s+if\b.*\bchanges?\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase | RegexOptions.Singleline);

    public QuestionInterpretation Interpret(
        ImpactAnswerRequest request,
        RuntimeRequestContext requestContext)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(requestContext);

        var matches = ExplicitIdentifier.Matches(request.Question ?? string.Empty)
            .Select(match => match.Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var clarificationReasons = new List<string>();
        if (string.IsNullOrWhiteSpace(request.InvestigationId))
        {
            clarificationReasons.Add("An active investigation is required.");
        }

        var question = request.Question ?? string.Empty;
        var hasImpactIntent = ImpactIntent.IsMatch(question) || ConditionalChangeIntent.IsMatch(question);
        if (hasImpactIntent && matches.Length == 0)
        {
            clarificationReasons.Add("An explicit requirement or entity identifier is required.");
        }
        else if (hasImpactIntent && matches.Length > 1)
        {
            clarificationReasons.Add("The question contains multiple possible subject identifiers.");
        }
        else if (!hasImpactIntent)
        {
            clarificationReasons.Add("The question does not describe an engineering-impact request.");
        }

        return new QuestionInterpretation(
            hasImpactIntent ? ImpactQuestionType.EngineeringImpact : ImpactQuestionType.Unsupported,
            question,
            null,
            hasImpactIntent && matches.Length == 1 ? matches[0] : null,
            null,
            clarificationReasons);
    }
}
