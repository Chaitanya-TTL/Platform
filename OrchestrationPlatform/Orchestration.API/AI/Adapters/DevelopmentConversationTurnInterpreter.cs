using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.QuestionUnderstanding;

namespace Orchestration.API.AI.Adapters;

public sealed class DevelopmentConversationTurnInterpreter : IConversationTurnInterpreter
{
    private readonly IConversationTurnInterpreter _inner;

    public DevelopmentConversationTurnInterpreter(IConversationTurnInterpreter inner)
    {
        ArgumentNullException.ThrowIfNull(inner);
        _inner = inner;
    }

    public async Task<ConversationTurnInterpretation> InterpretAsync(
        ConversationTurnInput input,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        var interpretation = await _inner.InterpretAsync(
            input,
            requestContext,
            cancellationToken).ConfigureAwait(false);

        if (interpretation.Type != ConversationTurnType.FollowUpExplanation ||
            interpretation.ReferenceCandidateIds.Count > 0)
        {
            return interpretation;
        }

        return interpretation with
        {
            Type = ConversationTurnType.Unsupported,
            ReasonCodes = Array.Empty<string>(),
            ClarificationRequired = false
        };
    }
}
