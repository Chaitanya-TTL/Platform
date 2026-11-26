using System.Text.RegularExpressions;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

internal static class FactFieldNeedResolver
{
    private static readonly (string Application, string FieldId, string Phrase)[] Fields =
    [
        ("codebeamer", "requirement.title", "title"),
        ("codebeamer", "requirement.status", "status"),
        ("codebeamer", "requirement.description", "description"),
        ("windchill", "windchill.part.number", "part number"),
        ("windchill", "windchill.part.revision", "revision"),
        ("windchill", "windchill.part.version", "version"),
        ("windchill", "windchill.part.latest", "latest"),
        ("windchill", "windchill.part.lifecycle-state", "lifecycle state"),
        ("windchill", "windchill.part.product-view", "product view"),
        ("windchill", "windchill.part.dimension", "dimension"),
        ("windchill", "windchill.part.weight", "weight"),
        ("windchill", "windchill.part.chemical-composition", "chemical composition"),
        ("windchill", "windchill.part.material-composition", "material composition"),
        ("configit", "configit.work-item.name", "work-item name"),
        ("configit", "configit.work-item.status", "work-item status"),
        ("configit", "configit.product-model.code", "product-model code"),
        ("configit", "configit.product-model.description", "product-model description"),
        ("configit", "configit.rule.expression", "rule expression"),
        ("configit", "configit.rule.enabled", "rule enabled"),
        ("configit", "configit.rule.locked", "rule locked")
    ];

    private static readonly Regex AttributeRequest = new(
        @"\b(?:what(?:'s|\s+is)|show(?:\s+me)?|give(?:\s+me)?|tell(?:\s+me)?)\b|\b(?:status|title|description|weight|revision|version|dimension)\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex CrossApplicationIntent = new(
        @"\b(?:cross[- ]application|across\s+(?:applications|systems)|product\s*360|other\s+systems|source\s+systems|(?:which|what)\s+(?:source\s+)?(?:applications?|systems?)|(?:summari[sz]e|overview)\b.*\b(?:investigation|captured|everything))\b",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly string[] KnownApplications =
    [
        "codebeamer",
        "windchill",
        "sap",
        "configit",
        "teamcenter"
    ];

    public static IReadOnlyList<string> ResolveFieldIds(
        string question,
        IReadOnlyList<string>? requestedApplications = null)
    {
        if (!AttributeRequest.IsMatch(question)) return Array.Empty<string>();

        var applicationFilter = requestedApplications is { Count: > 0 }
            ? new HashSet<string>(requestedApplications, StringComparer.OrdinalIgnoreCase)
            : null;
        var matches = Fields
            .Where(field =>
                (applicationFilter is null || applicationFilter.Contains(field.Application)) &&
                Regex.IsMatch(
                    question,
                    $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(field.Phrase)}(?![\p{{L}}\p{{N}}])",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            .Select(field => field.FieldId)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        return Array.AsReadOnly(matches);
    }

    public static IReadOnlyList<string> ResolveApplications(string question)
    {
        var applications = KnownApplications
            .Where(application => Regex.IsMatch(
                question,
                $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(application)}(?![\p{{L}}\p{{N}}])",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
            .ToArray();
        return Array.AsReadOnly(applications);
    }

    public static bool RequestsApplicationContext(string question) =>
        ResolveApplications(question).Count > 0 || CrossApplicationIntent.IsMatch(question);
}
