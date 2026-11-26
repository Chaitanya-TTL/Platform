using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Evaluation.PromptExperiments;

public sealed record FewShotPromptEvaluationReport(
    string SchemaVersion,
    string DatasetId,
    string DatasetVersion,
    string EvaluationScope,
    bool StructuralChecksPassed,
    int CaseCount,
    int GenerationCaseCount,
    int ControlCaseCount,
    int ModelCallCount,
    long BaselineEstimatedInputTokens,
    long FewShotEstimatedInputTokens,
    long EstimatedInputTokenIncrease,
    IReadOnlyList<string> RequiredScenarioTags,
    IReadOnlyList<string> CoveredScenarioTags,
    bool SemanticSupportEvaluated,
    bool LiveModelQualityEvaluated,
    bool HumanUsefulnessEvaluated,
    bool LatencyMeasured,
    bool CostMeasured,
    IReadOnlyList<FewShotPromptEvaluationCaseReport> Cases);

public sealed record FewShotPromptEvaluationCaseReport(
    string CaseId,
    FewShotPromptIntent Intent,
    IReadOnlyList<string> ScenarioTags,
    bool ModelCallExpected,
    AnswerDisposition ExpectedDisposition,
    bool StructuralChecksPassed,
    IReadOnlyList<string> SelectedExampleIds,
    int? BaselineEstimatedInputTokens,
    int? FewShotEstimatedInputTokens,
    int? EstimatedInputTokenIncrease);
