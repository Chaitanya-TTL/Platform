using System.Collections.Concurrent;
using System.Text;
using Lattice.AI.Runtime.Contracts.Generation;
using Microsoft.ML.Tokenizers;

namespace Lattice.AI.Runtime.Generation;

public static class ModelInputTokenBudget
{
    private const int MessageFramingTokenEstimate = 4;
    private static readonly ConcurrentDictionary<string, Tokenizer> Tokenizers =
        new(StringComparer.OrdinalIgnoreCase);

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

    public static int EstimateInputTokens(
        IReadOnlyList<ModelMessage> messages,
        string? tokenizerModelName = null)
    {
        ArgumentNullException.ThrowIfNull(messages);

        long estimatedTokens = 0;
        foreach (var message in messages)
        {
            estimatedTokens += EstimateTextTokens(message.Content, tokenizerModelName);
            estimatedTokens += MessageFramingTokenEstimate;
        }

        return estimatedTokens > int.MaxValue ? int.MaxValue : (int)estimatedTokens;
    }

    public static int EstimateTextTokens(string value, string? tokenizerModelName = null)
    {
        ArgumentNullException.ThrowIfNull(value);

        if (!string.IsNullOrWhiteSpace(tokenizerModelName))
        {
            var tokenizer = Tokenizers.GetOrAdd(
                tokenizerModelName,
                static modelName => TiktokenTokenizer.CreateForModel(modelName));
            return tokenizer.CountTokens(value);
        }

        return (Encoding.UTF8.GetByteCount(value) + 3) / 4;
    }
}
