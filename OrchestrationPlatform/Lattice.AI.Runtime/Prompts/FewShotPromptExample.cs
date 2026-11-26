namespace Lattice.AI.Runtime.Prompts;

public sealed record FewShotPromptExample(
    string Id,
    FewShotPromptIntent Intent,
    string Question,
    string Context,
    string ExpectedAnswer,
    IReadOnlyList<string> BehaviorTags);
