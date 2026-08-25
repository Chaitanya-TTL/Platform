using Orchestration.API.Engineering.Adapters.Teamcenter;
using Xunit;

namespace Orchestration.API.Tests.Engineering;

public sealed class TeamcenterFailureClassifierTests
{
    private readonly TeamcenterFailureClassifier classifier = new();

    [Theory]
    [InlineData("Failed to load item", "teamcenter-item-not-found")]
    [InlineData("Invalid credentials", "teamcenter-authentication-required")]
    [InlineData("Saved query unavailable", "teamcenter-query-unavailable")]
    [InlineData("HelloTeamcenter build failed", "teamcenter-build-failed")]
    [InlineData("Failed to open BOM window", "teamcenter-session-failed")]
    public void ClassifiesKnownSafeFailures(string output, string expectedCode)
    {
        Assert.Equal(expectedCode, classifier.Classify(output, 1, false).Code);
    }

    [Fact]
    public void MissingOutputIsDistinct() =>
        Assert.Equal("teamcenter-output-missing", classifier.Classify("", 0, false).Code);

    [Fact]
    public void TimeoutIsDistinctFromCancellation()
    {
        Assert.Equal("teamcenter-timeout", classifier.Classify(null, null, false, new TimeoutException()).Code);
        Assert.Equal("teamcenter-cancelled", classifier.Classify(null, null, false, new OperationCanceledException()).Code);
    }

    [Fact]
    public void ClientMessageNeverContainsRawProcessOutput()
    {
        const string raw = "private-runtime-detail";
        var error = classifier.Classify(raw, 9, false);
        Assert.DoesNotContain(raw, error.UserMessage);
        Assert.DoesNotContain(raw, error.Message);
    }
}
