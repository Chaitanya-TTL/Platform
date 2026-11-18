using System.Text.RegularExpressions;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

public sealed class QuestionInterpreter : IQuestionInterpreter
{
    private static readonly Regex ExplicitIdentifier = new(
        @"\b[A-Z][A-Z0-9]{1,}(?:[-_][A-Z0-9]+)*-\d[A-Z0-9._-]*\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex ImpactIntent = new(
        @"\b(impacts?|affects?|affected|changes?|revised?|revision|downstream)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

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

        if (matches.Length == 0)
        {
            clarificationReasons.Add("An explicit requirement or entity identifier is required.");
        }
        else if (matches.Length > 1)
        {
            clarificationReasons.Add("The question contains multiple possible subject identifiers.");
        }

        if (!ImpactIntent.IsMatch(request.Question ?? string.Empty))
        {
            clarificationReasons.Add("The question does not describe an engineering-impact request.");
        }

        return new QuestionInterpretation(
            clarificationReasons.Any(reason => reason.Contains("engineering-impact", StringComparison.Ordinal))
                ? ImpactQuestionType.Unsupported
                : ImpactQuestionType.EngineeringImpact,
            request.Question ?? string.Empty,
            null,
            matches.Length == 1 ? matches[0] : null,
            null,
            clarificationReasons);
    }
}
