using System.Diagnostics;
using System.Text;
namespace Orchestration.API.Services;
public interface IProcessRunner
{
    Task<(int exitCode,string output)> RunAsync(ProcessStartInfo info, TimeSpan timeout,
        Func<string,Task> progress, CancellationToken cancellationToken=default);
}
public sealed class ProcessRunner : IProcessRunner
{
    private readonly ILogger<ProcessRunner> _logger;
    public ProcessRunner(ILogger<ProcessRunner> logger) => _logger = logger;
    public async Task<(int exitCode,string output)> RunAsync(ProcessStartInfo info, TimeSpan timeout,
        Func<string,Task> progress, CancellationToken cancellationToken=default)
    {
        using var process = Process.Start(info) ?? throw new InvalidOperationException($"Failed to start {info.FileName}.");
        var output = new StringBuilder();
        var gate = new SemaphoreSlim(1,1);
        async Task DrainAsync(StreamReader reader,bool error,CancellationToken token)
        {
            while(await reader.ReadLineAsync(token) is { } line)
            {
                if(string.IsNullOrWhiteSpace(line)) continue;
                await gate.WaitAsync(token);
                try { output.AppendLine(error?$"[stderr] {line}":line); await progress(line); }
                finally { gate.Release(); }
            }
        }
        using var timeoutCts=new CancellationTokenSource(timeout);
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken,timeoutCts.Token);
        try
        {
            var stdout=DrainAsync(process.StandardOutput,false,linked.Token);
            var stderr=DrainAsync(process.StandardError,true,linked.Token);
            await Task.WhenAll(process.WaitForExitAsync(linked.Token),stdout,stderr);
        }
        catch(OperationCanceledException)
        {
            try { if(!process.HasExited) process.Kill(true); } catch(Exception ex) { _logger.LogWarning(ex,"Could not kill {FileName}",info.FileName); }
            if(timeoutCts.IsCancellationRequested) throw new TimeoutException($"{info.FileName} exceeded the {timeout.TotalSeconds:0}-second timeout.");
            throw;
        }
        return(process.ExitCode,output.ToString());
    }
}
