using System.ComponentModel.DataAnnotations;

namespace Orchestration.API.AI.Api;

/// <summary>Request to answer an engineering-impact question in an active investigation.</summary>
public sealed record ImpactAnswerRequestDto
{
    /// <summary>The active investigation that bounds resolution and evidence retrieval.</summary>
    [Required, StringLength(200)]
    public required string InvestigationId { get; init; }

    /// <summary>The engineering-impact question to answer.</summary>
    [Required, StringLength(4000)]
    public required string Question { get; init; }

    /// <summary>An optional conversation identifier used for request correlation.</summary>
    [StringLength(200)]
    public string? ConversationId { get; init; }
}
