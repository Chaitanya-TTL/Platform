using ConfigitAceIntegration.Models;

namespace ConfigitAceIntegration.Transformers;

public static class PartNameParser
{
    /// <summary>
    /// Cleans part name: "000575/A;2-PEN (View)" → "PEN (View)"
    /// Extract text after last ';' then after last '-'
    /// </summary>
    public static string CleanName(string fullName)
    {
        if (string.IsNullOrEmpty(fullName))
            return string.Empty;

        // Split on semicolon
        var afterSemicolon = fullName.Split(';').Last().Trim();
        
        // Split on dash and take first part after dash, trim
        var parts = afterSemicolon.Split('-', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 1 ? parts[1..].First().Trim() : afterSemicolon.Trim();
    }

    public static string ExtractPartNumber(string fullName)
    {
        if (string.IsNullOrEmpty(fullName))
            return string.Empty;

        var parts = fullName.Split('/');
        return parts.Length > 0 ? parts[0] : fullName;
    }
}
