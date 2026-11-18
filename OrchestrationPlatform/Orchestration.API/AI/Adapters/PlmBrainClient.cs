using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Evidence;
using Microsoft.Extensions.Options;

namespace Orchestration.API.AI.Adapters;

public interface IPlmBrainClient
{
    Task<PlmBrainEntityResolutionResponse> ResolveEntityAsync(
        string investigationId,
        string candidateEntityId,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);

    Task<PlmBrainImpactEvidenceResponse> RetrieveImpactAsync(
        string investigationId,
        string subjectEntityId,
        Lattice.AI.Runtime.Contracts.Scope.ImpactScope scope,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken);
}

public sealed class PlmBrainClient(
    HttpClient httpClient,
    PlmBrainWorkloadTokenProvider workloadTokenProvider,
    IOptions<PlmBrainServiceOptions> options) : IPlmBrainClient
{
    private static readonly JsonSerializerOptions ServiceJsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower) }
    };

    public Task<PlmBrainEntityResolutionResponse> ResolveEntityAsync(
        string investigationId,
        string candidateEntityId,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken) =>
        PostAsync<PlmBrainResolveEntityRequest, PlmBrainEntityResolutionResponse>(
            $"/api/internal/v1/investigations/{Uri.EscapeDataString(investigationId)}/entity-resolution",
            new PlmBrainResolveEntityRequest(candidateEntityId),
            authorization,
            requestContext,
            cancellationToken);

    public Task<PlmBrainImpactEvidenceResponse> RetrieveImpactAsync(
        string investigationId,
        string subjectEntityId,
        Lattice.AI.Runtime.Contracts.Scope.ImpactScope scope,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken) =>
        PostAsync<PlmBrainImpactEvidenceRequest, PlmBrainImpactEvidenceResponse>(
            $"/api/internal/v1/investigations/{Uri.EscapeDataString(investigationId)}/impact-evidence",
            new PlmBrainImpactEvidenceRequest(subjectEntityId, scope),
            authorization,
            requestContext,
            cancellationToken);

    private async Task<TResponse> PostAsync<TRequest, TResponse>(
        string path,
        TRequest body,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        var serviceOptions = options.Value;
        if (!Uri.TryCreate(serviceOptions.BaseAddress, UriKind.Absolute, out var baseAddress) ||
            string.IsNullOrWhiteSpace(serviceOptions.WorkloadScope))
        {
            throw new InvalidOperationException("The private PLM Brain service identity and address are not configured.");
        }

        var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseAddress, path))
        {
            Content = JsonContent.Create(body, options: ServiceJsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            await workloadTokenProvider.GetTokenAsync(
                requestContext.RequestId,
                serviceOptions.WorkloadScope,
                authorization.ExpiresAt,
                cancellationToken));
        request.Headers.Add("X-Lattice-Authorization-Decision", authorization.SignedDecisionToken);
        request.Headers.Add("X-Lattice-Request-Id", requestContext.RequestId);
        if (System.Diagnostics.Activity.Current is { IdFormat: System.Diagnostics.ActivityIdFormat.W3C } activity &&
            activity.TraceId.ToString().Equals(requestContext.TraceId, StringComparison.OrdinalIgnoreCase))
        {
            request.Headers.TryAddWithoutValidation("traceparent", activity.Id);
        }
        else if (IsW3CTraceId(requestContext.TraceId))
        {
            request.Headers.TryAddWithoutValidation(
                "traceparent",
                $"00-{requestContext.TraceId}-0000000000000001-01");
        }

        using (request)
        using (var response = await httpClient.SendAsync(request, cancellationToken))
        {
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<TResponse>(ServiceJsonOptions, cancellationToken)
                ?? throw new InvalidOperationException("PLM Brain returned an empty response.");
        }
    }

    private static bool IsW3CTraceId(string traceId) =>
        traceId.Length == 32 && traceId.All(Uri.IsHexDigit) &&
        traceId.Any(character => character != '0');
}
