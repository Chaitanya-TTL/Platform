using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Services;
public interface IEngineeringQueryNormalizer { QueryNormalizationRecord Normalize(EngineeringQuery query); NormalizedEngineeringQuery NormalizeFederated(EngineeringQuery query); }
public sealed class EngineeringQueryNormalizer : IEngineeringQueryNormalizer {
 public const int MaximumLength=256;
 public QueryNormalizationRecord Normalize(EngineeringQuery query) {
  var original=query.OriginalInput ?? query.ProductId ?? query.ProductName ?? "";
  if(original.Length>MaximumLength) throw new EngineeringValidationException("query-too-long","Query exceeds the maximum length.");
  if(original.Any(c=>char.IsControl(c) && c is not '\t' and not '\r' and not '\n')) throw new EngineeringValidationException("query-control-character","Query contains an unsupported control character.");
  var normalized=original.Trim(); var steps=new List<string>();
  if(!string.Equals(original,normalized,StringComparison.Ordinal)) steps.Add("trim-surrounding-whitespace");
  if(string.IsNullOrWhiteSpace(normalized)) throw new EngineeringValidationException("query-empty","A product ID, product name, or original input is required.");
  var inferred=query.IdentifierType; var confidence=ConfidenceClass.Unverified;
  if(inferred==IdentifierType.Auto) { if(!string.IsNullOrWhiteSpace(query.ProductId)){inferred=IdentifierType.ProductId;confidence=ConfidenceClass.Probable;} else if(!string.IsNullOrWhiteSpace(query.ProductName)){inferred=IdentifierType.ProductName;confidence=ConfidenceClass.Probable;} }
  return new(original,normalized,steps,Array.Empty<StructuredWarning>(),inferred,confidence);
 }
 public NormalizedEngineeringQuery NormalizeFederated(EngineeringQuery query) {
  var original=query.OriginalInput?.Trim();
  var id=Field(query.ProductId); var name=Field(query.ProductName);
  if(id.NormalizedValue is null && name.NormalizedValue is null && string.IsNullOrWhiteSpace(original)) throw new EngineeringValidationException("query-empty","A product ID, product name, or original input is required.");
  if((query.ProductId?.Length??0)>MaximumLength||(query.ProductName?.Length??0)>MaximumLength||(query.OriginalInput?.Length??0)>MaximumLength) throw new EngineeringValidationException("query-too-long","Query exceeds the maximum length.");
  foreach(var value in new[]{query.ProductId,query.ProductName,query.OriginalInput}) if(value?.Any(c=>char.IsControl(c) && c is not '\t' and not '\r' and not '\n')==true) throw new EngineeringValidationException("query-control-character","Query contains an unsupported control character.");
  var type=query.IdentifierType==IdentifierType.Auto?(id.NormalizedValue is not null?IdentifierType.ProductId:IdentifierType.ProductName):query.IdentifierType;
  return new(query.OriginalInput,id,name,type,query.Revision,query.Version,Array.Empty<StructuredWarning>());
 }
 static NormalizedQueryField Field(string? value){if(string.IsNullOrWhiteSpace(value))return new(value,null,Array.Empty<string>());var trimmed=value.Trim();return new(value,trimmed,string.Equals(value,trimmed,StringComparison.Ordinal)?Array.Empty<string>():new[]{"trim-surrounding-whitespace"});}

}
public sealed class EngineeringValidationException : Exception { public string Code {get;} public EngineeringValidationException(string code,string message):base(message){Code=code;} }
