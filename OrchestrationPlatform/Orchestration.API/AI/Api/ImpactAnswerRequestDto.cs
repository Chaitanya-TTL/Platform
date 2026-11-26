using System.ComponentModel.DataAnnotations;
using Lattice.AI.Runtime.Contracts.Conversation;

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

    /// <summary>An optional Copilot turn identifier used for request correlation.</summary>
    [StringLength(128)]
    public string? TurnId { get; init; }

    /// <summary>The parent assistant turn for a server-loaded continuation state.</summary>
    [StringLength(128)]
    public string? ParentTurnId { get; init; }

    /// <summary>Optional structured state loaded by the server from the existing thread.</summary>
    public ConversationState? PreviousConversationState { get; init; }

    /// <summary>Completed transcript turns used only as untrusted conversational context.</summary>
    [MaxLength(50)]
    public IReadOnlyList<ConversationHistoryTurn> ConversationHistory { get; init; } =
        Array.Empty<ConversationHistoryTurn>();
}
