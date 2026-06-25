using ConfigitAceIntegration.Dtos;
using ConfigitAceIntegration.Models;

namespace ConfigitAceIntegration.Abstractions;

/// <summary>
/// Validates Teamcenter extraction and Configit BOM schemas.
/// </summary>
public interface IValidationService
{
    /// <summary>
    /// Validates the extracted Teamcenter data for schema compliance and integrity.
    /// </summary>
    /// <param name="extraction">The extraction DTO to validate</param>
    /// <returns>Validation result with errors if any</returns>
    ValidationResult ValidateExtraction(TcExtractionDto extraction);
    
    /// <summary>
    /// Validates the transformed BOM structure for Configit compliance.
    /// </summary>
    /// <param name="bomStructure">The BOM structure DTO to validate</param>
    /// <returns>Validation result with errors if any</returns>
    ValidationResult ValidateBomStructure(BomStructureDto bomStructure);
}

/// <summary>
/// Result of a validation operation.
/// </summary>
public record ValidationResult(bool IsValid, IReadOnlyCollection<string> Errors)
{
    public static ValidationResult Success() => new(true, Array.Empty<string>());
    
    public static ValidationResult Failure(params string[] errors) => 
        new(false, errors);
    
    public static ValidationResult Failure(IEnumerable<string> errors) => 
        new(false, errors.ToList());
}
