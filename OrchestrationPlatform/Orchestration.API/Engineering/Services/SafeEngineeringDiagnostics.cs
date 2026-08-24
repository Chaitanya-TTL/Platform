using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Services;
public interface ISafeEngineeringDiagnostics { void Event(string requestId,string correlationId,string? jobId,EngineeringSource source,EngineeringStage stage,string status,long? durationMs=null,string? warningCode=null,string? errorCode=null,string? safeIdentifier=null); }
public sealed class SafeEngineeringDiagnostics:ISafeEngineeringDiagnostics {
 readonly ILogger<SafeEngineeringDiagnostics> logger; public SafeEngineeringDiagnostics(ILogger<SafeEngineeringDiagnostics> logger)=>this.logger=logger;
 public void Event(string requestId,string correlationId,string? jobId,EngineeringSource source,EngineeringStage stage,string status,long? durationMs=null,string? warningCode=null,string? errorCode=null,string? safeIdentifier=null)=>logger.LogInformation("Engineering event RequestId={RequestId} CorrelationId={CorrelationId} JobId={JobId} Source={Source} Stage={Stage} Status={Status} DurationMs={DurationMs} WarningCode={WarningCode} ErrorCode={ErrorCode} SafeIdentifier={SafeIdentifier}",requestId,correlationId,jobId,source,stage,status,durationMs,warningCode,errorCode,safeIdentifier);
}
