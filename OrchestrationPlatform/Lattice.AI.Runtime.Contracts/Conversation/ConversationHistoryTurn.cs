using System.ComponentModel.DataAnnotations;

namespace Lattice.AI.Runtime.Contracts.Conversation;

public sealed record ConversationHistoryTurn(
    [property: Required, StringLength(128)] string TurnId,
    [property: Required, StringLength(10_000)] string UserMessage,
    [property: Required, StringLength(10_000)] string AssistantMessage,
    ConversationTurnDisposition Disposition);
