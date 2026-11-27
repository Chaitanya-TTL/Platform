using System.ClientModel;
using System.Diagnostics;
using System.Net;
using Azure;
using Azure.AI.OpenAI;
using Azure.Identity;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Generation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Lattice.AI.Runtime.Azure.Models;

public sealed class AzureOpenAiModelGateway : IModelGateway
{
    private readonly IChatClient _chatClient;
    private readonly AiRuntimeOptions _options;

    public AzureOpenAiModelGateway(IOptions<AiRuntimeOptions> options)
        : this(CreateChatClient(options), options)
    {
    }

    public AzureOpenAiModelGateway(
        IOptions<AiRuntimeOptions> options,
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<AzureOpenAiModelGateway> logger)
        : this(CreateChatClient(options, configuration, environment, logger), options)
    {
    }

    public AzureOpenAiModelGateway(IChatClient chatClient, IOptions<AiRuntimeOptions> options)
    {
        ArgumentNullException.ThrowIfNull(chatClient);
        ArgumentNullException.ThrowIfNull(options);
        options.Value.Validate();

        _chatClient = chatClient;
        _options = options.Value;
    }

    public async Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(request.RequestContext);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.ModelConfigurationId);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.ContextPackageId);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.PromptBundleId);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.PromptBundleVersion);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.OutputSchemaVersion);
        ArgumentNullException.ThrowIfNull(request.Messages);
        cancellationToken.ThrowIfCancellationRequested();

        var messages = request.Messages
            .Select(message => new ChatMessage(ToChatRole(message.Role), message.Content))
            .ToArray();
        var chatOptions = new ChatOptions
        {
            MaxOutputTokens = _options.MaxOutputTokens,
            ResponseFormat = ChatResponseFormat.Json
        };
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(_options.TimeoutSeconds));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeout.Token);
        var stopwatch = Stopwatch.StartNew();
        ChatResponse response;
        try
        {
            response = await _chatClient.GetResponseAsync(messages, chatOptions, linked.Token).ConfigureAwait(false);
        }
        catch (ClientResultException exception)
        {
            HttpStatusCode? statusCode = exception.Status is >= 100 and <= 599
                ? (HttpStatusCode)exception.Status
                : null;
            throw new HttpRequestException(
                HttpRequestError.Unknown,
                "Azure OpenAI returned a provider error.",
                exception,
                statusCode);
        }
        catch (global::Azure.RequestFailedException exception)
        {
            throw new HttpRequestException(
                HttpRequestError.Unknown,
                "Azure OpenAI returned a provider error.",
                exception);
        }
        catch (AuthenticationFailedException exception)
        {
            throw new HttpRequestException(
                HttpRequestError.Unknown,
                "Azure OpenAI authentication failed.",
                exception);
        }
        stopwatch.Stop();
        if (string.IsNullOrWhiteSpace(response.Text))
        {
            throw new InvalidOperationException("Azure OpenAI returned an empty model response.");
        }

        return new ModelResponse(
            request.RequestContext,
            response.Text,
            "azure-openai",
            response.ModelId ?? _options.DeploymentName,
            null,
            ToTokenCount(response.Usage?.InputTokenCount),
            ToTokenCount(response.Usage?.OutputTokenCount),
            stopwatch.Elapsed);
    }

    private static IChatClient CreateChatClient(IOptions<AiRuntimeOptions> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        options.Value.Validate();
        var endpoint = new Uri(options.Value.Endpoint, UriKind.Absolute);
        var azureClient = new AzureOpenAIClient(endpoint, new DefaultAzureCredential());
        return azureClient.GetChatClient(options.Value.DeploymentName).AsIChatClient();
    }

    private static IChatClient CreateChatClient(
        IOptions<AiRuntimeOptions> options,
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<AzureOpenAiModelGateway> logger)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);
        ArgumentNullException.ThrowIfNull(logger);
        options.Value.Validate();

        var endpoint = new Uri(options.Value.Endpoint, UriKind.Absolute);
        var apiKey = environment.IsDevelopment()
            ? configuration["AZURE_OPENAI_API_KEY"]?.Trim()
            : null;
        AzureOpenAIClient azureClient;
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            logger.LogInformation(
                "Azure OpenAI credential provider path: {CredentialProviderPath}",
                "DevelopmentApiKey");
            azureClient = new AzureOpenAIClient(endpoint, new AzureKeyCredential(apiKey));
        }
        else
        {
            logger.LogInformation(
                "Azure OpenAI credential provider path: {CredentialProviderPath}",
                "DefaultAzureCredential");
            azureClient = new AzureOpenAIClient(endpoint, new DefaultAzureCredential());
        }

        return azureClient.GetChatClient(options.Value.DeploymentName).AsIChatClient();
    }

    private static ChatRole ToChatRole(string role)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(role);

        return role switch
        {
            "system" => ChatRole.System,
            "user" => ChatRole.User,
            "assistant" => ChatRole.Assistant,
            _ => throw new ArgumentException($"Unsupported model message role '{role}'.", nameof(role))
        };
    }

    private static int? ToTokenCount(long? count)
    {
        return count is >= 0 and <= int.MaxValue ? (int)count.Value : null;
    }
}
