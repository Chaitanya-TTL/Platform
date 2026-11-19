using System.Security.Cryptography;
using System.Text;
using Lattice.AI.Runtime.Contracts.Authorization;

namespace Lattice.AI.Runtime.QuestionUnderstanding;

public static class ConversationStateOwnerFingerprint
{
    public static string Create(AuthorizationScope authorization)
    {
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentException.ThrowIfNullOrWhiteSpace(authorization.TenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(authorization.SubjectId);

        var value = $"{authorization.TenantId.Length}:{authorization.TenantId}{authorization.SubjectId.Length}:{authorization.SubjectId}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    }
}
