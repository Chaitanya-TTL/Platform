using Lattice.AI.Runtime.Generation;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class ModelInputTokenBudgetTests
{
    [Fact]
    public void Fits_WhenInputAndOutputAndSafetyMarginExactlyFillLimit()
    {
        Assert.True(ModelInputTokenBudget.Fits(750, maxInputTokens: 1000, maxOutputTokens: 100));
    }

    [Fact]
    public void Fits_WhenInputExceedsLimitByOneToken_ReturnsFalse()
    {
        Assert.False(ModelInputTokenBudget.Fits(751, maxInputTokens: 1000, maxOutputTokens: 100));
    }

    [Fact]
    public void Fits_ReservesConfiguredOutputTokens()
    {
        Assert.True(ModelInputTokenBudget.Fits(700, maxInputTokens: 1000, maxOutputTokens: 150));
        Assert.False(ModelInputTokenBudget.Fits(700, maxInputTokens: 1000, maxOutputTokens: 151));
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(100, 15)]
    [InlineData(101, 16)]
    public void CalculateSafetyMargin_CeilsFifteenPercent(int maxInputTokens, int expected)
    {
        Assert.Equal(expected, ModelInputTokenBudget.CalculateSafetyMargin(maxInputTokens));
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

        Assert.Equal(5811, allowanceWithSmallPrompt);
        Assert.Equal(1843, allowanceWithLargePrompt);
        Assert.True(allowanceWithLargePrompt < allowanceWithSmallPrompt);
    }

    [Fact]
    public void Fits_UsesOverflowSafeArithmetic()
    {
        Assert.False(ModelInputTokenBudget.Fits(
            int.MaxValue,
            maxInputTokens: int.MaxValue,
            maxOutputTokens: 0));
    }
}
