using Azure.Core;
using Azure.Identity;
using Azure.Monitor.OpenTelemetry.AspNetCore;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.ApplicationContext;
using Lattice.AI.Runtime.Azure.Models;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.FactEvidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.SourceEvidence;
using Lattice.AI.Runtime.Telemetry;
using Lattice.AI.Runtime.Validation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Orchestration.API.AI.Adapters;
using Orchestration.API.AI.Telemetry;

namespace Orchestration.API.AI.Composition;

public static class AiRuntimeServiceCollectionExtensions
{
    private const int DevelopmentInputTokenAllowanceFallback = int.MaxValue;

    public static IServiceCollection AddAiRuntime(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        services.Configure<PlmBrainServiceOptions>(configuration.GetSection("AiRuntime:PlmBrain"));
        services.Configure<AiRuntimeTelemetryOptions>(configuration.GetSection("AiRuntime:Telemetry"));
        services.AddOptions<CopilotExecutionTraceOptions>()
            .Bind(configuration.GetSection("AiRuntime:Diagnostics"))
            .Validate(
                options => !options.FullPayloadTraceEnabled || !environment.IsProduction(),
                "Full Copilot payload tracing is not permitted in Production.")
            .ValidateOnStart();
        services.TryAddSingleton<TimeProvider>(TimeProvider.System);
        services.AddSingleton<IAiRuntimeTelemetry, AiRuntimeTelemetry>();
        services.AddSingleton<ICopilotExecutionTrace>(provider =>
        {
            var options = provider.GetRequiredService<IOptions<CopilotExecutionTraceOptions>>().Value;
            return options.Enabled
                ? ActivatorUtilities.CreateInstance<CopilotExecutionTraceLogger>(provider)
                : CopilotExecutionTraceNoOp.Instance;
        });
        if (environment.IsDevelopment())
        {
            services.Replace(ServiceDescriptor.Singleton<
                IResourceAuthorizationDecisionProvider,
                LocalDevelopmentResourceAuthorizationDecisionProvider>());
            services.Replace(ServiceDescriptor.Singleton<
                IAuthorizationDecisionTokenIssuer,
                LocalDevelopmentAuthorizationDecisionTokenIssuer>());
        }
        else
        {
            services.TryAddSingleton<IResourceAuthorizationDecisionProvider, UnavailableResourceAuthorizationDecisionProvider>();
        }

        services.AddSingleton<TokenCredential, DefaultAzureCredential>();
        services.Configure<AiRuntimeOptions>(configuration.GetSection("AiRuntime"));
        services.PostConfigure<AiRuntimeOptions>(options =>
        {
            var endpoint = configuration["AZURE_OPENAI_ENDPOINT"];
            if (!string.IsNullOrWhiteSpace(endpoint))
            {
                options.Endpoint = endpoint.Trim();
            }

            var deploymentName = configuration["AZURE_OPENAI_DEPLOYMENT"];
            if (!string.IsNullOrWhiteSpace(deploymentName))
            {
                options.DeploymentName = deploymentName.Trim();
            }
        });
        if (environment.IsDevelopment())
        {
            services.PostConfigure<AiRuntimeOptions>(options =>
            {
                options.MaxInputTokens = DevelopmentInputTokenAllowanceFallback;
            });
        }

        services.AddSingleton<ModelConfiguration>(provider =>
        {
            var options = provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<AiRuntimeOptions>>().Value;
            provider.GetRequiredService<ILoggerFactory>()
                .CreateLogger(nameof(AiRuntimeServiceCollectionExtensions))
                .LogInformation(
                    "AI runtime token allowances: MaxInputTokens={MaxInputTokens}, MaxOutputTokens={MaxOutputTokens}, DevelopmentInputTokenFallbackApplied={DevelopmentInputTokenFallbackApplied}",
                    options.MaxInputTokens,
                    options.MaxOutputTokens,
                    environment.IsDevelopment());
            return new ModelConfiguration(
                "azure-openai",
                "azure-openai",
                string.IsNullOrWhiteSpace(options.DeploymentName) ? "unconfigured" : options.DeploymentName,
                options.DeploymentName,
                options.MaxOutputTokens,
                options.MaxInputTokens);
        });
        services.AddTransient<AzureOpenAiModelGateway>(provider =>
            new AzureOpenAiModelGateway(
                provider.GetRequiredService<IOptions<AiRuntimeOptions>>(),
                configuration,
                environment,
                provider.GetRequiredService<ILogger<AzureOpenAiModelGateway>>()));
        services.AddTransient<IModelGateway>(provider =>
            new DeferredModelGateway(provider.GetRequiredService<AzureOpenAiModelGateway>));
        services.TryAddSingleton<IContextCompiler, ContextCompiler>();
        services.TryAddSingleton<IPromptCatalog, SourceControlledPromptCatalog>();
        services.TryAddSingleton<IPromptAssembler, PromptAssembler>();
        services.TryAddSingleton<IAnswerCandidateParser, AnswerCandidateParser>();
        services.TryAddSingleton<IAnswerValidator, AnswerValidator>();
        if (environment.IsDevelopment())
        {
            services.Replace(ServiceDescriptor.Singleton<
                IAnswerCandidateParser,
                DevelopmentAnswerCandidateParser>());
            services.Replace(ServiceDescriptor.Singleton<
                IAnswerValidator,
                DevelopmentAnswerPassThroughValidator>());
        }
        services.AddScoped<IImpactAnswerService, ImpactAnswerService>();
        services.AddSingleton<PlmBrainWorkloadTokenProvider>();
        if (!environment.IsDevelopment())
        {
            services.AddSingleton<IAuthorizationDecisionTokenSigner, KeyVaultAuthorizationDecisionTokenIssuer>();
            services.AddSingleton<IAuthorizationDecisionTokenIssuer>(provider =>
            {
                var serviceOptions = provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<PlmBrainServiceOptions>>().Value;
                return new AuthorizationDecisionTokenIssuer(
                    provider.GetRequiredService<IAuthorizationDecisionTokenSigner>(),
                    new AuthorizationDecisionTicketOptions
                    {
                        Issuer = serviceOptions.TicketIssuer ?? string.Empty,
                        Audience = serviceOptions.TicketAudience ?? string.Empty,
                        MaximumLifetimeSeconds = serviceOptions.MaximumAuthorizationTicketLifetimeSeconds
                    },
                    provider.GetRequiredService<TimeProvider>());
            });
        }

        services.PostConfigure<PlmBrainServiceOptions>(options =>
        {
            if (environment.IsDevelopment())
            {
                if (string.IsNullOrWhiteSpace(options.BaseAddress))
                {
                    options.BaseAddress = "http://localhost:3000";
                }
                if (string.IsNullOrWhiteSpace(options.WorkloadScope))
                {
                    options.WorkloadScope = "local-development";
                }
            }
        });

        services.AddScoped<IAuthorizationContextProvider, AspNetAuthorizationContextProvider>();
        services.Configure<ConversationStateRetentionOptions>(
            configuration.GetSection("AiRuntime:ConversationState"));
        services.AddSingleton(provider =>
            provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<ConversationStateRetentionOptions>>().Value);
        services.AddSingleton<IQuestionInterpreter, QuestionInterpreter>();
        services.AddSingleton<IConversationTurnInterpreter, ConversationTurnInterpreter>();
        if (environment.IsDevelopment())
        {
            services.Replace(ServiceDescriptor.Singleton<IConversationTurnInterpreter>(
                _ => new DevelopmentConversationTurnInterpreter(new ConversationTurnInterpreter())));
        }
        services.AddSingleton<IScopePlanner, ScopePlanner>();
        services.AddHttpClient<IPlmBrainClient, PlmBrainClient>()
            .AddStandardResilienceHandler();
        services.AddTransient<IEngineeringEntityResolver, PlmBrainEntityResolver>();
        services.AddTransient<IEngineeringEvidenceSource, PlmBrainEngineeringEvidenceSource>();
        services.AddTransient<ISourceEvidenceRetriever, PlmBrainSourceEvidenceRetriever>();
        services.AddTransient<IFactEvidenceRetriever, PlmBrainFactEvidenceRetriever>();
        services.AddTransient<IApplicationContextRetriever, PlmBrainApplicationContextRetriever>();

        if (environment.IsDevelopment())
        {
            services
                .AddAuthentication(LocalDevelopmentAuthenticationHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, LocalDevelopmentAuthenticationHandler>(
                    LocalDevelopmentAuthenticationHandler.SchemeName,
                    _ => { });
        }
        else
        {
            var authority = configuration["AiRuntime:Authentication:Authority"];
            var audience = configuration["AiRuntime:Authentication:Audience"];
            services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.Authority = authority;
                    options.Audience = audience;
                    options.MapInboundClaims = false;
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidateAudience = true,
                        ValidateIssuerSigningKey = true,
                        ValidateLifetime = true,
                        ClockSkew = TimeSpan.Zero,
                        NameClaimType = "sub",
                        RoleClaimType = "roles"
                    };
                });
        }

        services.AddAuthorization(options =>
        {
            options.AddPolicy("AiRuntime", policy => policy.RequireAuthenticatedUser());
        });

        var openTelemetry = services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                .AddService("Orchestration.API")
                .AddAttributes(
                [
                    new KeyValuePair<string, object>("deployment.environment", environment.EnvironmentName)
                ]))
            .WithTracing(tracing => tracing
                .AddSource(AiRuntimeTelemetry.ActivitySourceName)
                .AddProcessor(provider => new AiRuntimeTelemetryPrivacyProcessor(
                    provider.GetRequiredService<IOptions<AiRuntimeTelemetryOptions>>().Value))
                .AddAspNetCoreInstrumentation(options => options.RecordException = false)
                .AddHttpClientInstrumentation(options => options.RecordException = false))
            .WithMetrics(metrics => metrics
                .AddMeter(AiRuntimeTelemetry.MeterName)
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation());

        if (configuration.GetValue<bool>("AzureMonitor:Enabled"))
        {
            var connectionString = configuration["AzureMonitor:ConnectionString"];
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                connectionString = configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"];
            }
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException(
                    "Azure Monitor is enabled but no connection string is configured.");
            }

            openTelemetry.UseAzureMonitor(options => options.ConnectionString = connectionString);
        }

        return services;
    }

    private sealed class DeferredModelGateway(Func<AzureOpenAiModelGateway> createGateway) : IModelGateway
    {
        public Task<Lattice.AI.Runtime.Contracts.Generation.ModelResponse> GenerateAsync(
            ModelRequest request,
            CancellationToken cancellationToken) =>
            createGateway().GenerateAsync(request, cancellationToken);
    }
}
