using Azure.Core;
using Azure.Identity;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Azure.Models;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.Validation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Orchestration.API.AI.Adapters;

namespace Orchestration.API.AI.Composition;

public static class AiRuntimeServiceCollectionExtensions
{
    public static IServiceCollection AddAiRuntime(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<PlmBrainServiceOptions>(configuration.GetSection("AiRuntime:PlmBrain"));
        services.TryAddSingleton<TimeProvider>(TimeProvider.System);
        services.TryAddSingleton<IResourceAuthorizationDecisionProvider, UnavailableResourceAuthorizationDecisionProvider>();
        services.AddSingleton<TokenCredential, DefaultAzureCredential>();
        services.Configure<AiRuntimeOptions>(configuration.GetSection("AiRuntime"));
        services.AddSingleton<ModelConfiguration>(provider =>
        {
            var options = provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<AiRuntimeOptions>>().Value;
            return new ModelConfiguration(
                "azure-openai",
                "azure-openai",
                string.IsNullOrWhiteSpace(options.DeploymentName) ? "unconfigured" : options.DeploymentName,
                options.DeploymentName,
                options.MaxOutputTokens);
        });
        services.AddTransient<AzureOpenAiModelGateway>();
        services.AddTransient<IModelGateway>(provider =>
            new DeferredModelGateway(provider.GetRequiredService<AzureOpenAiModelGateway>));
        services.TryAddSingleton<IContextCompiler, ContextCompiler>();
        services.TryAddSingleton<IPromptCatalog, SourceControlledPromptCatalog>();
        services.TryAddSingleton<IPromptAssembler, PromptAssembler>();
        services.TryAddSingleton<IAnswerCandidateParser, AnswerCandidateParser>();
        services.TryAddSingleton<IAnswerValidator, AnswerValidator>();
        services.AddScoped<IImpactAnswerService, ImpactAnswerService>();
        services.AddSingleton<PlmBrainWorkloadTokenProvider>();
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
        services.AddScoped<IAuthorizationContextProvider, AspNetAuthorizationContextProvider>();
        services.AddSingleton<IQuestionInterpreter, QuestionInterpreter>();
        services.AddSingleton<IScopePlanner, ScopePlanner>();
        services.AddHttpClient<IPlmBrainClient, PlmBrainClient>()
            .AddStandardResilienceHandler();
        services.AddTransient<IEngineeringEntityResolver, PlmBrainEntityResolver>();
        services.AddTransient<IEngineeringEvidenceSource, PlmBrainEngineeringEvidenceSource>();

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
        services.AddAuthorization(options =>
        {
            options.AddPolicy("AiRuntime", policy => policy.RequireAuthenticatedUser());
        });

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
