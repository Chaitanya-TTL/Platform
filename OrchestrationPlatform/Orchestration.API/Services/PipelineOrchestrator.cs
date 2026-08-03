using System.Collections.Concurrent;
using System.Threading.Channels;
using Orchestration.API.Models;
namespace Orchestration.API.Services;
public interface IPipelineOrchestrator
{
    Task InitializeProgressChannelAsync(string jobId);
    Task<(bool success,BomRoot finalBom,string outputFilePath,string outputKind)> ExecutePipelineAsync(string jobId,ExtractionRequest request,Func<PipelineProgress,Task> progressCallback);
    Task SubscribeToProgressAsync(string jobId,Func<PipelineProgress,Task> callback);
}
public sealed class PipelineOrchestrator:IPipelineOrchestrator
{
    private readonly ISubprocessExecutor _subprocessExecutor;private readonly IAuditLogger _auditLogger;private readonly ILogger<PipelineOrchestrator> _logger;
    private readonly ConcurrentDictionary<string,Channel<PipelineProgress>> _progressChannels=new();
    public PipelineOrchestrator(ISubprocessExecutor subprocessExecutor,IAuditLogger auditLogger,ILogger<PipelineOrchestrator> logger){_subprocessExecutor=subprocessExecutor;_auditLogger=auditLogger;_logger=logger;}
    public Task InitializeProgressChannelAsync(string jobId){_progressChannels.TryAdd(jobId,Channel.CreateUnbounded<PipelineProgress>());return Task.CompletedTask;}
    public async Task SubscribeToProgressAsync(string jobId,Func<PipelineProgress,Task> callback){if(_progressChannels.TryGetValue(jobId,out var channel))await foreach(var p in channel.Reader.ReadAllAsync())await callback(p);}
    public async Task<(bool success,BomRoot finalBom,string outputFilePath,string outputKind)> ExecutePipelineAsync(string jobId,ExtractionRequest request,Func<PipelineProgress,Task> callback)
    {
        if(!_progressChannels.TryGetValue(jobId,out var channel)){channel=Channel.CreateUnbounded<PipelineProgress>();_progressChannels.TryAdd(jobId,channel);}
        var source=request.Kind==ExtractionKind.Sap?"SAP":request.Kind==ExtractionKind.Configit?"Configit":"TeamCenter";
        var audit=new AuditLog{JobId=jobId,TeamcenterItemId=request.GetIdentifier()??"",StartTime=DateTime.UtcNow,Status="in_progress"};await _auditLogger.LogAsync(audit);
        var outputKind=request.Kind.ToString().ToLowerInvariant();
        try
        {
            await Report(jobId,"extract","in_progress",0,$"Connecting to {source}...",callback,channel);
            var extraction=await _subprocessExecutor.ExecuteAsync(request,message=>Report(jobId,"transform","in_progress",request.Kind==ExtractionKind.Sap&&request.IncludeSapBusinessImpact?70:80,message,callback,channel));
            if(!extraction.Success||extraction.Bom==null)throw new Exception($"Pipeline execution failed: {extraction.Output}");
            if(request.Kind==ExtractionKind.Sap&&request.IncludeSapBusinessImpact)await Report(jobId,"sap-impact","in_progress",90,"Finalizing SAP Stock, Inventory and Cost impact...",callback,channel);
            audit.Status="success";audit.EndTime=DateTime.UtcNow;audit.FinalBom=extraction.Bom;audit.SapBusinessImpact=extraction.SapImpact;audit.OutputFilePath=extraction.BomOutputPath;audit.SapImpactOutputFilePath=extraction.SapImpactOutputPath;audit.OutputKind=outputKind;
            audit.Phases.Add(new PhaseLog{Phase="complete",Status="complete",StartTime=audit.StartTime,EndTime=audit.EndTime,ProgressPercent=100,Message="Pipeline completed successfully"});
            await _auditLogger.LogAsync(audit);await Report(jobId,"load","complete",100,"Pipeline completed successfully!",callback,channel);
            return(true,extraction.Bom,extraction.BomOutputPath??"",outputKind);
        }
        catch(Exception ex){_logger.LogError(ex,"Pipeline failed for job {JobId}",jobId);audit.Status="failed";audit.Error=ex.Message;audit.EndTime=DateTime.UtcNow;await _auditLogger.LogAsync(audit);await Report(jobId,"error","error",0,$"Error: {ex.Message}",callback,channel);return(false,null!,null!,outputKind);}
        finally{if(_progressChannels.TryGetValue(jobId,out var ch))ch.Writer.TryComplete();}
    }
    private async Task Report(string jobId,string phase,string status,int percent,string message,Func<PipelineProgress,Task> callback,Channel<PipelineProgress> channel){var p=new PipelineProgress{JobId=jobId,Phase=phase,Status=status,ProgressPercent=percent,Message=message,Timestamp=DateTime.UtcNow.ToString("O")};try{await callback(p);await channel.Writer.WriteAsync(p);}catch(Exception ex){_logger.LogError(ex,"Error reporting progress");}}
}
