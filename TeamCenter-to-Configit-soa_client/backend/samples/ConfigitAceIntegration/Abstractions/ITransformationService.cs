using ConfigitAceIntegration.Dtos;
using ConfigitAceIntegration.Models;

namespace ConfigitAceIntegration.Abstractions;

/// <summary>
/// Orchestrates transformation from Teamcenter extraction JSON to Configit BOM structure.
/// </summary>
public interface ITransformationService
{
    /// <summary>
    /// Transforms a Teamcenter extraction DTO to Configit BOM structure.
    /// </summary>
    /// <param name="extraction">The parsed Teamcenter extraction data</param>
    /// <returns>Configit-ready BOM structure DTO</returns>
    BomStructureDto Transform(TcExtractionDto extraction);
    
    /// <summary>
    /// Parses raw JSON string to Teamcenter extraction DTO.
    /// </summary>
    /// <param name="jsonContent">Raw JSON content</param>
    /// <returns>Parsed extraction DTO</returns>
    /// <exception cref="ArgumentException">If JSON is invalid or missing required fields</exception>
    TcExtractionDto ParseExtraction(string jsonContent);
}
