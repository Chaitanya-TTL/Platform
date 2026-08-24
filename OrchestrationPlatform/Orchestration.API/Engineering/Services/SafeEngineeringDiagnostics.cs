using System.Text.RegularExpressions;using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Services;
public interface ISafeEngineeringDiagnostics{void Event(string requestId,string correlationId,string? jobId,EngineeringSource source,EngineeringStage stage,string status,long? durationMs=null,string? warningCode=null,string? errorCode=null,string? safeIdentifier=null);}
public sealed class SafeEngineeringDiagnostics:ISafeEngineeringDiagnostics
{
 static readonly Regex Safe=new("^[A-Za-z0-9._:-]{0,128}$",RegexOptions.Compiled);readonly ILogger<SafeEngineeringDiagnostics> logger;public SafeEngineeringDiagnostics(ILogger<SafeEngineeringDiagnostics> logger)=>this.logger=logger;
 static string? Clean(string? value)=>string.IsNullOrWhiteSpace(value)?null:Safe.IsMatch(value)?value:"invalid-safe-value";
 public void Event(string requestId,string correlationId,string? jobId,EngineeringSource source,EngineeringStage stage,string status,long? durationMs=null,string? warningCode=null,string? errorCode=null,string? safeIdentifier=null)=>logger.LogInformation("Engineering event RequestId={RequestId} CorrelationId={CorrelationId} JobId={JobId} Source={Source} Stage={Stage} Status={Status} DurationMs={DurationMs} WarningCode={WarningCode} ErrorCode={ErrorCode} SafeIdentifier={SafeIdentifier}",Clean(requestId),Clean(correlationId),Clean(jobId),source,stage,Clean(status),durationMs,Clean(warningCode),Clean(errorCode),Clean(safeIdentifier));
}
