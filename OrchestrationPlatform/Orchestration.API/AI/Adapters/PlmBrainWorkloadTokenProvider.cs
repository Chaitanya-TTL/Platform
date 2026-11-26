using Azure.Core;
using System.Collections.Concurrent;
using Microsoft.Extensions.Hosting;

namespace Orchestration.API.AI.Adapters;

public sealed class PlmBrainWorkloadTokenProvider(
    TokenCredential credential,
    IHostEnvironment? hostEnvironment = null)
{
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private readonly ConcurrentDictionary<string, RequestToken> _requestTokens = new(StringComparer.Ordinal);

    public async Task<string> GetTokenAsync(
        string requestId,
        string scope,
        DateTimeOffset decisionExpiresAt,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (now >= decisionExpiresAt)
        {
            throw new InvalidOperationException("The authorization decision expired before the PLM request.");
        }

        if (hostEnvironment?.IsDevelopment() == true)
        {
            return LocalDevelopmentAuthenticationHandler.Token;
        }

        foreach (var cachedRequest in _requestTokens)
        {
            if (cachedRequest.Value.DecisionExpiresAt <= now)
            {
                _requestTokens.TryRemove(cachedRequest.Key, out _);
            }
        }

        if (_requestTokens.TryGetValue(requestId, out var cached) &&
            cached.Scope == scope &&
            cached.AccessToken.ExpiresOn > now)
        {
            return cached.AccessToken.Token;
        }

        await _tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (_requestTokens.TryGetValue(requestId, out cached) &&
                cached.Scope == scope &&
                cached.AccessToken.ExpiresOn > DateTimeOffset.UtcNow)
            {
                return cached.AccessToken.Token;
            }

            var result = await credential.GetTokenAsync(new TokenRequestContext([scope]), cancellationToken);
            if (result.ExpiresOn <= decisionExpiresAt)
            {
                throw new InvalidOperationException("The workload token expires before the authorization decision.");
            }

            _requestTokens[requestId] = new RequestToken(scope, result, decisionExpiresAt);
            return result.Token;
        }
        finally
        {
            _tokenLock.Release();
        }
    }

    private sealed record RequestToken(string Scope, AccessToken AccessToken, DateTimeOffset DecisionExpiresAt);
}
