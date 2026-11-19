using Lattice.AI.Runtime.Azure.Models;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace Lattice.AI.Runtime.Tests.Generation;

public sealed class ModelGatewayTests
{
    [Fact]
    public async Task GenerateAsync_MapsMessagesAndPreservesRequestContext()
    {
        var response = new ChatResponse(new ChatMessage(ChatRole.Assistant, """{"schemaVersion":"answer-v1"}"""));
        var chatClient = new FakeChatClient((_, _, _) => Task.FromResult(response));
        var gateway = new AzureOpenAiModelGateway(chatClient, Options.Create(CreateOptions()));
        var request = Request();

        var modelResponse = await gateway.GenerateAsync(request, CancellationToken.None);

        Assert.Same(request.RequestContext, modelResponse.RequestContext);
        Assert.Same(response, chatClient.Response);
        Assert.Equal(2, chatClient.Messages!.Count);
        Assert.Equal(ChatRole.System, chatClient.Messages[0].Role);
        Assert.Equal(ChatRole.User, chatClient.Messages[1].Role);
        Assert.Equal("deployment-v1", modelResponse.Model);
        Assert.Equal("""{"schemaVersion":"answer-v1"}""", modelResponse.Content);
        Assert.Equal(256, chatClient.Options!.MaxOutputTokens);
        Assert.Equal(ChatResponseFormat.Json, chatClient.Options.ResponseFormat);
    }

    [Fact]
    public async Task GenerateAsync_PassesCancellationToProvider()
    {
        using var cancellation = new CancellationTokenSource();
        CancellationToken observedToken = default;
        var chatClient = new FakeChatClient((_, _, token) =>
        {
            observedToken = token;
            cancellation.Cancel();
            return Task.FromCanceled<ChatResponse>(token);
        });
        var gateway = new AzureOpenAiModelGateway(chatClient, Options.Create(CreateOptions()));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            gateway.GenerateAsync(Request(), cancellation.Token));

        Assert.True(observedToken.IsCancellationRequested);
    }

    [Fact]
    public async Task GenerateAsync_PassesProviderFailureThroughUnwrapped()
    {
        var providerError = new InvalidOperationException("provider unavailable");
        var chatClient = new FakeChatClient((_, _, _) => Task.FromException<ChatResponse>(providerError));
        var gateway = new AzureOpenAiModelGateway(chatClient, Options.Create(CreateOptions()));

        var actual = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            gateway.GenerateAsync(Request(), CancellationToken.None));

        Assert.Same(providerError, actual);
    }

    [Theory]
    [MemberData(nameof(AzureProviderFailures))]
    public async Task GenerateAsync_WrapsAzureProviderFailuresWithoutExposingProviderMessage(Exception providerFailure)
    {
        var chatClient = new FakeChatClient((_, _, _) => Task.FromException<ChatResponse>(providerFailure));
        var gateway = new AzureOpenAiModelGateway(chatClient, Options.Create(CreateOptions()));

        var actual = await Assert.ThrowsAsync<HttpRequestException>(() =>
            gateway.GenerateAsync(Request(), CancellationToken.None));

        Assert.Same(providerFailure, actual.InnerException);
        Assert.DoesNotContain("AZURE_PRIVATE_MARKER", actual.Message, StringComparison.Ordinal);
    }

    public static IEnumerable<object[]> AzureProviderFailures()
    {
        yield return [new global::Azure.RequestFailedException(500, "AZURE_PRIVATE_MARKER")];
        yield return [new global::Azure.Identity.AuthenticationFailedException("AZURE_PRIVATE_MARKER")];
    }

    [Fact]
    public async Task GenerateAsync_RejectsEmptyProviderResponse()
    {
        var chatClient = new FakeChatClient((_, _, _) => Task.FromResult(new ChatResponse()));
        var gateway = new AzureOpenAiModelGateway(chatClient, Options.Create(CreateOptions()));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            gateway.GenerateAsync(Request(), CancellationToken.None));
    }

    [Theory]
    [InlineData(0, 256)]
    [InlineData(121, 256)]
    [InlineData(30, 0)]
    [InlineData(30, 8193)]
    public void Constructor_RejectsUnboundedTimeoutOrTokenConfiguration(int timeoutSeconds, int maxOutputTokens)
    {
        var options = CreateOptions();
        options.TimeoutSeconds = timeoutSeconds;
        options.MaxOutputTokens = maxOutputTokens;

        Assert.Throws<InvalidOperationException>(() =>
            new AzureOpenAiModelGateway(new FakeChatClient((_, _, _) => Task.FromResult(new ChatResponse())), Options.Create(options)));
    }

    [Theory]
    [InlineData(-1, 256)]
    [InlineData(256, 256)]
    [InlineData(255, 256)]
    public void Constructor_RejectsMissingOrInvalidInputTokenAllowance(int maxInputTokens, int maxOutputTokens)
    {
        var options = CreateOptions();
        options.MaxInputTokens = maxInputTokens;
        options.MaxOutputTokens = maxOutputTokens;

        Assert.Throws<InvalidOperationException>(() =>
            new AzureOpenAiModelGateway(new FakeChatClient((_, _, _) => Task.FromResult(new ChatResponse())), Options.Create(options)));
    }

    [Fact]
    public void Constructor_RejectsUnconfiguredDefaultInputTokenAllowance()
    {
        var options = CreateOptions();
        options.MaxInputTokens = default;

        Assert.Equal(0, options.MaxInputTokens);
        Assert.Throws<InvalidOperationException>(() =>
            new AzureOpenAiModelGateway(new FakeChatClient((_, _, _) => Task.FromResult(new ChatResponse())), Options.Create(options)));
    }

    [Theory]
    [InlineData(257, 256)]
    [InlineData(131072, 8192)]
    [InlineData(int.MaxValue, 8192)]
    public void Constructor_AcceptsValidInputTokenAllowance(int maxInputTokens, int maxOutputTokens)
    {
        var options = CreateOptions();
        options.MaxInputTokens = maxInputTokens;
        options.MaxOutputTokens = maxOutputTokens;

        var gateway = new AzureOpenAiModelGateway(
            new FakeChatClient((_, _, _) => Task.FromResult(new ChatResponse())),
            Options.Create(options));

        Assert.NotNull(gateway);
    }

    private static ModelRequest Request() => new(
        new RuntimeRequestContext("request-1", "trace-1", "parent-1", "conversation-1"),
        "engineering-impact",
        "v1",
        "package-1",
        "model-config",
        [
            new ModelMessage("system", "instructions"),
            new ModelMessage("user", """{"investigationId":"investigation-1"}""")
        ],
        "answer-v1");

    private static AiRuntimeOptions CreateOptions() => new()
    {
        Endpoint = "https://example.openai.azure.com",
        DeploymentName = "deployment-v1",
        TimeoutSeconds = 30,
        MaxOutputTokens = 256,
        MaxInputTokens = 4096
    };

    private sealed class FakeChatClient(
        Func<IEnumerable<ChatMessage>, ChatOptions?, CancellationToken, Task<ChatResponse>> getResponse) : IChatClient
    {
        public IReadOnlyList<ChatMessage>? Messages { get; private set; }

        public ChatOptions? Options { get; private set; }

        public ChatResponse? Response { get; private set; }

        public async Task<ChatResponse> GetResponseAsync(
            IEnumerable<ChatMessage> chatMessages,
            ChatOptions? options = null,
            CancellationToken cancellationToken = default)
        {
            Messages = chatMessages.ToArray();
            Options = options;
            Response = await getResponse(Messages, options, cancellationToken);
            return Response;
        }

        public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
            IEnumerable<ChatMessage> chatMessages,
            ChatOptions? options = null,
            CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public object? GetService(Type serviceType, object? serviceKey = null) => null;

        public void Dispose()
        {
        }
    }
}
