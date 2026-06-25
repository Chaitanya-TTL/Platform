using ConfigitAceIntegration.Abstractions;
using ConfigitAceIntegration.Dtos;
using ConfigitAceIntegration.Infrastructure.Validators;
using ConfigitAceIntegration.Models;
using Microsoft.Extensions.Logging;

namespace ConfigitAceIntegration.Application;

/// <summary>
/// Validation service orchestrating schema and integrity checks for extraction and BOM data.
/// </summary>
public class ValidationService : IValidationService
{
    private readonly ILogger<ValidationService> _logger;

    public ValidationService(ILogger<ValidationService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Validates the extracted Teamcenter data for schema compliance and integrity.
    /// </summary>
    public ValidationResult ValidateExtraction(TcExtractionDto extraction)
    {
        var errors = new List<string>();

        // Required fields
        if (extraction.BomRoot == null)
            errors.Add("BomRoot is required");

        if (string.IsNullOrEmpty(extraction.SourceItemId))
            errors.Add("SourceItemId is required");

        if (string.IsNullOrEmpty(extraction.SourceRevId))
            errors.Add("SourceRevId is required");

        // BOM integrity
        if (extraction.BomRoot != null)
        {
            var bomErrors = BomSchemaValidator.ValidateBomTree(extraction.BomRoot);
            errors.AddRange(bomErrors);
        }

        if (errors.Any())
        {
            _logger.LogWarning("Extraction validation failed with {Count} errors", errors.Count);
            foreach (var error in errors)
                _logger.LogWarning("  - {Error}", error);
            return ValidationResult.Failure(errors);
        }

        _logger.LogInformation("Extraction validation passed");
        return ValidationResult.Success();
    }

    /// <summary>
    /// Validates the transformed BOM structure for Configit compliance.
    /// </summary>
    public ValidationResult ValidateBomStructure(BomStructureDto bomStructure)
    {
        var errors = new List<string>();

        BomSchemaValidator.ValidateBomStructure(bomStructure, "", errors);

        if (errors.Any())
        {
            _logger.LogWarning("BOM structure validation failed with {Count} errors", errors.Count);
            foreach (var error in errors)
                _logger.LogWarning("  - {Error}", error);
            return ValidationResult.Failure(errors);
        }

        _logger.LogInformation("BOM structure validation passed");
        return ValidationResult.Success();
    }
}
