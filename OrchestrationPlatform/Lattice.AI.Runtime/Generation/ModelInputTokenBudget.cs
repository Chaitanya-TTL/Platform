using System.Text;
using Lattice.AI.Runtime.Contracts.Generation;

namespace Lattice.AI.Runtime.Generation;

public static class ModelInputTokenBudget
{
    private const int MessageFramingTokenEstimate = 4;

    public static int CalculateContextAllowance(
        int maxInputTokens,
        int maxOutputTokens,
        int estimatedFixedPromptTokens)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxInputTokens);
        ArgumentOutOfRangeException.ThrowIfNegative(maxOutputTokens);
        ArgumentOutOfRangeException.ThrowIfNegative(estimatedFixedPromptTokens);

        var allowance = (long)maxInputTokens -
                        maxOutputTokens -
                        estimatedFixedPromptTokens;
        return (int)Math.Max(0, allowance);
    }

    public static bool Fits(int estimatedInputTokens, int maxInputTokens, int maxOutputTokens)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(estimatedInputTokens);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxInputTokens);
        ArgumentOutOfRangeException.ThrowIfNegative(maxOutputTokens);

        return (long)estimatedInputTokens + maxOutputTokens <= maxInputTokens;
    }

    public static int EstimateInputTokens(IReadOnlyList<ModelMessage> messages)
    {
        ArgumentNullException.ThrowIfNull(messages);

        long estimatedTokens = 0;
        foreach (var message in messages)
        {
            estimatedTokens += EstimateTextTokens(message.Content);
            estimatedTokens += MessageFramingTokenEstimate;
        }

        return estimatedTokens > int.MaxValue ? int.MaxValue : (int)estimatedTokens;
    }

    private static int EstimateTextTokens(string value) =>
        (Encoding.UTF8.GetByteCount(value) + 3) / 4;
}
