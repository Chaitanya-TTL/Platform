using Azure.Identity;
using Azure.Security.KeyVault.Keys;
using Azure.Security.KeyVault.Keys.Cryptography;
using Lattice.AI.Runtime.Authorization;
using Microsoft.Extensions.Options;

namespace Orchestration.API.AI.Adapters;

public sealed class KeyVaultAuthorizationDecisionTokenIssuer : IAuthorizationDecisionTokenSigner
{
    private readonly IOptions<PlmBrainServiceOptions> _options;
    private readonly Lazy<Task<(string KeyId, CryptographyClient Client)>> _key;
    private readonly DefaultAzureCredential _credential = new();

    public KeyVaultAuthorizationDecisionTokenIssuer(IOptions<PlmBrainServiceOptions> options)
    {
        _options = options;
        _key = new Lazy<Task<(string KeyId, CryptographyClient Client)>>(LoadKeyAsync);
    }

    public async Task<string> GetKeyIdAsync(CancellationToken cancellationToken)
    {
        var key = await _key.Value.WaitAsync(cancellationToken);
        return key.KeyId;
    }

    public async Task<byte[]> SignAsync(
        ReadOnlyMemory<byte> data,
        CancellationToken cancellationToken)
    {
        var key = await _key.Value.WaitAsync(cancellationToken);
        var result = await key.Client.SignDataAsync(
            SignatureAlgorithm.RS256,
            data.ToArray(),
            cancellationToken);
        return result.Signature;
    }

    private async Task<(string KeyId, CryptographyClient Client)> LoadKeyAsync()
    {
        var serviceOptions = _options.Value;
        if (!Uri.TryCreate(serviceOptions.SigningKeyVaultUri, UriKind.Absolute, out var vaultUri) ||
            string.IsNullOrWhiteSpace(serviceOptions.SigningKeyName))
        {
            throw new InvalidOperationException("The authorization decision signing key is not configured.");
        }

        var keyClient = new KeyClient(vaultUri, _credential);
        var key = await keyClient.GetKeyAsync(serviceOptions.SigningKeyName);
        return (key.Value.Properties.Id.AbsoluteUri,
            new CryptographyClient(key.Value.Id, _credential));
    }
}
