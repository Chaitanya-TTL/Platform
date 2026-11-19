using Lattice.AI.Runtime.Contracts.Requests;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

public interface IQuestionInterpreter
{
    QuestionInterpretation Interpret(
        ImpactAnswerRequest request,
        RuntimeRequestContext requestContext);
}
