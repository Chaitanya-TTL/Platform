using System.ComponentModel.DataAnnotations;

namespace Lattice.AI.Runtime.Contracts.Conversation;

public sealed record ConversationHistoryTurn(
    [param: Required, StringLength(128)] string TurnId,
    [param: Required, StringLength(10_000)] string UserMessage,
    [param: Required, StringLength(10_000)] string AssistantMessage,
    ConversationTurnDisposition Disposition);
