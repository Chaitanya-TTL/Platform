using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Evaluation.PromptExperiments;

public sealed record FewShotPromptEvaluationDataset(
    string Id,
    string Version,
    string Classification,
    IReadOnlyList<string> RequiredScenarioTags,
    IReadOnlyList<FewShotPromptEvaluationCase> Cases);

public sealed record FewShotPromptEvaluationCase(
    string CaseId,
    FewShotPromptIntent Intent,
    IReadOnlyList<string> ScenarioTags,
    ImpactAnswerRequest Request,
    ContextPackage Context,
    bool ModelCallExpected,
    AnswerDisposition ExpectedDisposition,
    IReadOnlyList<string> ExpectedClaimIds,
    IReadOnlyList<string> ExpectedEvidenceIds,
    IReadOnlyList<string> ExpectedSourceIds);
