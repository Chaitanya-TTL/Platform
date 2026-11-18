using Lattice.AI.Runtime.Contracts.Answers;

namespace Lattice.AI.Runtime.Generation;

public interface IAnswerCandidateParser
{
    AnswerCandidate Parse(string content);
}
