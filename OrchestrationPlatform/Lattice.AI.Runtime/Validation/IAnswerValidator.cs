using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.Validation;

public interface IAnswerValidator
{
    ValidationResult Validate(
        AnswerCandidate answer,
        ContextPackage context,
        AuthorizationScope authorization,
        RuntimeRequestContext requestContext,
        string investigationId);
}
