using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Prompts;

public interface IPromptAssembler
{
    int EstimateFixedPromptTokens(ImpactAnswerRequest request, PromptBundle prompt);

    ModelRequest Assemble(
        ImpactAnswerRequest request,
        ContextPackage context,
        PromptBundle prompt,
        ModelConfiguration configuration);
}
