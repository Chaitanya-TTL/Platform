using System.Text.RegularExpressions;

namespace ConfigitAceIntegration.Infrastructure.Validators;

/// <summary>
/// Validates variant condition expressions.
/// </summary>
public static class ExpressionValidator
{
    // Pattern: VAR_NAME = VALUE or VAR NAME = VALUE, with optional AND/OR chains
    // Allows spaces in variable/value names (e.g., "NIB TYPE = THICK")
    private static readonly Regex ExpressionPattern = new(
        @"^[A-Z_][A-Z_0-9\s]*=\s*[A-Z_0-9\-\s]+(\s+(AND|OR)\s+[A-Z_][A-Z_0-9\s]*=\s*[A-Z_0-9\-\s]+)*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase
    );

    /// <summary>
    /// Validates a variant condition expression format.
    /// </summary>
    public static void ValidateExpression(string? definition, string context, List<string> errors)
    {
        if (string.IsNullOrEmpty(definition))
            return;

        // Basic SQL injection prevention
        if (definition.Contains(";") || definition.Contains("--") || definition.Contains("'") || definition.Contains("\""))
        {
            errors.Add($"Expression contains potentially dangerous characters at {context}: {definition}");
            return;
        }

        // Pattern validation
        if (!ExpressionPattern.IsMatch(definition.Trim()))
        {
            errors.Add($"Expression format invalid at {context}: {definition}. Expected format: 'VAR = VALUE' or 'VAR = VALUE AND/OR VAR = VALUE'");
        }
    }
}
