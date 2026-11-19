using System.Diagnostics;
using System.Text.RegularExpressions;
using OpenTelemetry;

namespace Orchestration.API.AI.Telemetry;

public sealed class AiRuntimeTelemetryPrivacyProcessor(AiRuntimeTelemetryOptions options)
    : BaseProcessor<Activity>
{
    private static readonly Regex IdentifierPathSegments = new(
        @"(?<collection>/(?:investigations?|entity|entities|tenants?|subjects?|users?|documents?|sources?|relationships?|authorization-decisions?|parts?|requirements?|components?|items?|products?|records?|objects?)/)(?<identifier>[^/?#]+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex UrlInDisplayName = new(
        @"(?:https?://|/)[^\s]+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly HashSet<string> UrlAttributeNames =
    [
        "url.full",
        "http.url",
        "url.path",
        "http.target"
    ];

    public override void OnEnd(Activity activity)
    {
        SanitizeTags(activity);

        if (LooksLikeUrl(activity.DisplayName))
        {
            activity.DisplayName = SanitizeDisplayName(activity.DisplayName);
        }

        base.OnEnd(activity);
    }

    internal static bool ShouldRemoveTag(string name, AiRuntimeTelemetryOptions options)
    {
        var normalizedName = name.ToLowerInvariant().Replace('_', '.');
        if (IsCredentialTag(normalizedName) || IsQueryAttribute(normalizedName))
        {
            return true;
        }

        if (HasIdentifier(normalizedName, "subject") ||
            HasIdentifier(normalizedName, "decision"))
        {
            return true;
        }

        return HasIdentifier(normalizedName, "investigation") && !options.IncludeInvestigationIdentifier ||
               HasIdentifier(normalizedName, "entity") && !options.IncludeEntityIdentifier ||
               HasIdentifier(normalizedName, "tenant") && !options.IncludeTenantIdentifier ||
               HasContextPackageIdentifier(normalizedName) && !options.IncludeContextPackageIdentifier;
    }

    private void SanitizeTags(Activity activity)
    {
        foreach (var tag in activity.TagObjects.ToArray())
        {
            if (ShouldRemoveTag(tag.Key, options))
            {
                activity.SetTag(tag.Key, null);
            }
            else if (IsUrlAttribute(tag.Key) && tag.Value is string url)
            {
                activity.SetTag(tag.Key, SanitizeUrl(url));
            }
        }
    }

    private static bool HasIdentifier(string name, string identifierClass) =>
        name.Contains(identifierClass, StringComparison.Ordinal) &&
        (name.Contains(".id", StringComparison.Ordinal) ||
         name.EndsWith("id", StringComparison.Ordinal) ||
         name.Contains("identifier", StringComparison.Ordinal));

    private static bool HasContextPackageIdentifier(string name) =>
        name.Contains("context.package", StringComparison.Ordinal) && HasIdentifier(name, "package");

    private static bool IsCredentialTag(string name) =>
        name.Contains("header", StringComparison.Ordinal) &&
        (name.Contains("authorization", StringComparison.Ordinal) ||
         name.Contains("bearer", StringComparison.Ordinal) ||
         name.Contains("ticket", StringComparison.Ordinal) ||
         name.Contains("token", StringComparison.Ordinal) ||
         name.Contains("cookie", StringComparison.Ordinal) ||
         name.Contains("api-key", StringComparison.Ordinal) ||
         name.Contains("api.key", StringComparison.Ordinal) ||
         name.Contains("apikey", StringComparison.Ordinal) ||
         name.Contains("auth.token", StringComparison.Ordinal)) ||
        name.Contains("credential", StringComparison.Ordinal) ||
        name.Contains("password", StringComparison.Ordinal) ||
        name.Contains("secret", StringComparison.Ordinal) ||
        name.Contains("signed.token", StringComparison.Ordinal);

    private static bool IsQueryAttribute(string name) =>
        name is "url.query" or "http.url.query";

    private static bool IsUrlAttribute(string name) =>
        UrlAttributeNames.Contains(name.ToLowerInvariant());

    private static bool LooksLikeUrl(string value) =>
        value.Contains("/investigations/", StringComparison.OrdinalIgnoreCase) ||
        value.Contains("://", StringComparison.OrdinalIgnoreCase) ||
        value.StartsWith("/", StringComparison.Ordinal) ||
        value.Contains(" /", StringComparison.Ordinal);

    private static string SanitizeDisplayName(string displayName) =>
        UrlInDisplayName.Replace(displayName, match => SanitizeUrl(match.Value));

    private static string SanitizeUrl(string url)
    {
        var suffixIndex = url.IndexOfAny(['?', '#']);
        var withoutQueryOrFragment = suffixIndex < 0 ? url : url[..suffixIndex];
        if (!Uri.TryCreate(withoutQueryOrFragment, UriKind.Absolute, out var uri))
        {
            return RedactIdentifierPathSegments(withoutQueryOrFragment);
        }

        var sanitizedPath = RedactIdentifierPathSegments(uri.AbsolutePath);
        var sanitizedUri = new UriBuilder(uri)
        {
            UserName = string.Empty,
            Password = string.Empty,
            Path = sanitizedPath,
            Query = string.Empty,
            Fragment = string.Empty
        };
        return sanitizedUri.Uri.GetLeftPart(UriPartial.Path);
    }

    private static string RedactIdentifierPathSegments(string path) =>
        IdentifierPathSegments.Replace(path, "$1{identifier}");
}
