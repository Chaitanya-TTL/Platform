using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

/// <summary>Interprets engineering questions within an active investigation.</summary>
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
        if (hasImpactIntent && matches.Length > 1)
        {
            clarificationReasons.Add("The question contains multiple possible subject identifiers.");
        }

        var requestedSourceApplications = FactFieldNeedResolver.ResolveApplications(question);
        return new QuestionInterpretation(
            hasImpactIntent ? ImpactQuestionType.EngineeringImpact : ImpactQuestionType.InvestigationQuestion,
            question,
            null,
            matches.Length == 1 ? matches[0] : null,
            null,
            clarificationReasons)
        {
            RequestedFactFieldIds = FactFieldNeedResolver.ResolveFieldIds(
                question,
                requestedSourceApplications),
            RequestedSourceApplications = requestedSourceApplications,
            ApplicationContextRequested = FactFieldNeedResolver.RequestsApplicationContext(question)
        };
    }
}
