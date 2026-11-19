using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

public interface IConversationTurnInterpreter
{
    Task<ConversationTurnInterpretation> InterpretAsync(
        ConversationTurnInput input,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);
}
