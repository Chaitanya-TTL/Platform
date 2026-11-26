using Lattice.AI.Runtime.Contracts.Conversation;

namespace Lattice.AI.Runtime.Contracts.Requests;

public sealed record ConversationTurnInterpretation(
    ConversationTurnType Type,
    IReadOnlyList<string> ExplicitIdentifiers,
    IReadOnlyList<string> ReferenceCandidateIds,
    ConversationFilterDelta FilterDelta,
    ConversationOutputDimension? OutputDimension,
    bool IsAmbiguous,
    IReadOnlyList<string> ReasonCodes,
    bool ClarificationRequired)
{
    public IReadOnlyList<string> RequestedFactFieldIds { get; init; } = Array.Empty<string>();
    public bool ApplicationContextRequested { get; init; }
}
