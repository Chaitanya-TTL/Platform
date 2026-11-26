namespace Lattice.AI.Runtime.Prompts;

public sealed record FewShotPromptSet(
    string Id,
    string Version,
    string BasePromptId,
    string BasePromptVersion,
    string Classification,
    IReadOnlyList<FewShotPromptExample> Examples)
{
    public IReadOnlyList<FewShotPromptExample> SelectFor(FewShotPromptIntent intent)
    {
        if (!Enum.IsDefined(intent))
        {
            throw new ArgumentOutOfRangeException(nameof(intent), intent, "The few-shot intent is not supported.");
        }

        return Array.AsReadOnly(Examples
            .Where(example => example.Intent == intent)
            .ToArray());
    }
}
