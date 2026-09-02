using System.Security.Cryptography;using System.Text;using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Intelligence;
public static class EngineeringIntelligenceIdentityFactory
{
 public static string Entity(string kind,string source,string nativeId)=>$"eng:{Token(kind)}:{Token(source)}:{Token(nativeId)}";
 public static string Relationship(string kind,string sourceId,string targetId,string? qualifier=null)=>$"rel:{Token(kind)}:{Hash(sourceId)}:{Hash(targetId)}{(string.IsNullOrWhiteSpace(qualifier)?"":":"+Token(qualifier))}";
 public static string Evidence(EngineeringSource source,string executionId,string kind,string reference)=>$"ev:{source.ToString().ToLowerInvariant()}:{Hash(executionId)}:{Token(kind)}:{Hash(reference)}";
 public static string Finding(string kind,string subjectId,string key)=>$"finding:{Token(kind)}:{Hash(subjectId)}:{Hash(key)}";
 public static string Cluster(string identity)=>$"cluster:{Hash(identity)}";
 static string Token(string value)=>string.Concat(value.Trim().ToLowerInvariant().Select(c=>char.IsLetterOrDigit(c)?c:'-')).Trim('-');
 static string Hash(string value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value.Trim())))[..16].ToLowerInvariant();
}
