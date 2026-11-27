using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Contracts.Generation;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class ModelInputTokenBudgetTests
{
    [Fact]
    public void Fits_WhenInputAndOutputExactlyFillLimit()
    {
        Assert.True(ModelInputTokenBudget.Fits(900, maxInputTokens: 1000, maxOutputTokens: 100));
    }

    [Fact]
    public void Fits_WhenInputExceedsLimitByOneToken_ReturnsFalse()
    {
        Assert.False(ModelInputTokenBudget.Fits(901, maxInputTokens: 1000, maxOutputTokens: 100));
    }

    [Fact]
    public void Fits_ReservesConfiguredOutputTokens()
    {
        Assert.True(ModelInputTokenBudget.Fits(850, maxInputTokens: 1000, maxOutputTokens: 150));
        Assert.False(ModelInputTokenBudget.Fits(850, maxInputTokens: 1000, maxOutputTokens: 151));
    }

    [Fact]
    public void CalculateContextAllowance_ClampsInsufficientCapacityToZero()
    {
        Assert.Equal(
            0,
            ModelInputTokenBudget.CalculateContextAllowance(
                maxInputTokens: 256,
                maxOutputTokens: 200,
                estimatedFixedPromptTokens: 100));
    }

    [Fact]
    public void CalculateContextAllowance_DeductsLargeFixedPromptOverhead()
    {
        var allowanceWithSmallPrompt = ModelInputTokenBudget.CalculateContextAllowance(
            maxInputTokens: 8192,
            maxOutputTokens: 1024,
            estimatedFixedPromptTokens: 128);
        var allowanceWithLargePrompt = ModelInputTokenBudget.CalculateContextAllowance(
            maxInputTokens: 8192,
            maxOutputTokens: 1024,
            estimatedFixedPromptTokens: 4096);

        Assert.Equal(7040, allowanceWithSmallPrompt);
        Assert.Equal(3072, allowanceWithLargePrompt);
        Assert.True(allowanceWithLargePrompt < allowanceWithSmallPrompt);
    }

    [Fact]
    public void Fits_UsesOverflowSafeArithmetic()
    {
        Assert.False(ModelInputTokenBudget.Fits(
            int.MaxValue,
            maxInputTokens: int.MaxValue,
            maxOutputTokens: 1));
    }

    [Fact]
    public void EstimateInputTokens_UsesConfiguredModelTokenizer()
    {
        const string content = "Exact model tokenization keeps evidence stages within the provider window.";
        var messages = new[] { new ModelMessage("user", content) };

        var actual = ModelInputTokenBudget.EstimateInputTokens(messages, "gpt-4o");

        Assert.Equal(
            Microsoft.ML.Tokenizers.TiktokenTokenizer.CreateForModel("gpt-4o").CountTokens(content) + 4,
            actual);
    }
}
