using System.Diagnostics;
using Newtonsoft.Json;
using Microsoft.Extensions.Options;
using Orchestration.API.Models;
namespace Orchestration.API.Services;
public interface ISapCapabilityProbeService
{
    Task<(SapCapabilityReport report,string outputPath,string processOutput)> RunAsync(string materialId,string plant,CancellationToken cancellationToken);
}
public sealed class SapCapabilityProbeService : ISapCapabilityProbeService
{
    private readonly ExtractorOptions _options; private readonly IProcessRunner _runner;
    private readonly SemaphoreSlim _gate; private readonly ILogger<SapCapabilityProbeService> _logger;
    public SapCapabilityProbeService(IOptions<ExtractorOptions> options,IProcessRunner runner,ILogger<SapCapabilityProbeService> logger)
    { _options=options.Value; _runner=runner; _logger=logger; _gate=new SemaphoreSlim(Math.Max(1,_options.MaxConcurrentSapJobs)); }
    public async Task<(SapCapabilityReport report,string outputPath,string processOutput)> RunAsync(string materialId,string plant,CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            var dir=_options.ResolveSapPath(); var jar=Path.Combine(dir,"lib","sapjco3.jar");
            var dll=Path.Combine(dir,"lib","sapjco3.dll"); var config=Path.Combine(dir,"config","sap.properties");
            var source=Path.Combine(dir,"src","SapMaterialImpactProbe.java");
            var @class=Path.Combine(dir,"out","SapMaterialImpactProbe.class");
            foreach(var file in new[]{jar,dll,config,source}) if(!File.Exists(file)) throw new FileNotFoundException("Required SAP probe file not found.",file);
            var runId=$"probe_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}"[..38];
            var runtime=Path.Combine(dir,"runtime","probe",runId); Directory.CreateDirectory(runtime);
            var output=Path.Combine(runtime,"sap_material_impact_probe.json");
            if(_options.CompileJavaAtRuntime && (!File.Exists(@class)||File.GetLastWriteTimeUtc(source)>File.GetLastWriteTimeUtc(@class)))
            {
                var compile=BaseInfo(_options.JavacExecutable,dir); compile.ArgumentList.Add("-cp");compile.ArgumentList.Add(jar);
                compile.ArgumentList.Add("-d");compile.ArgumentList.Add(Path.Combine(dir,"out"));compile.ArgumentList.Add(source);
                var result=await _runner.RunAsync(compile,TimeSpan.FromSeconds(90),m=>Task.CompletedTask,token);
                if(result.exitCode!=0) throw new InvalidOperationException("SAP probe compilation failed. "+result.output);
            }
            var info=BaseInfo(_options.JavaExecutable,dir); info.ArgumentList.Add($"-Djava.library.path={Path.Combine(dir,"lib")}");
            info.ArgumentList.Add("-cp");info.ArgumentList.Add($"{Path.Combine(dir,"out")};{jar}");
            info.ArgumentList.Add("SapMaterialImpactProbe");info.ArgumentList.Add(materialId);info.ArgumentList.Add(plant);info.ArgumentList.Add(output);
            var run=await _runner.RunAsync(info,TimeSpan.FromSeconds(Math.Max(30,_options.SapTimeoutSeconds)),m=>Task.CompletedTask,token);
            if(run.exitCode!=0) throw new InvalidOperationException("SAP probe failed. "+run.output);
            if(!File.Exists(output)) throw new FileNotFoundException("SAP probe completed without a diagnostic JSON.",output);
            var report=JsonConvert.DeserializeObject<SapCapabilityReport>(await File.ReadAllTextAsync(output,token))
                ?? throw new InvalidOperationException("SAP probe returned invalid JSON.");
            return(report,output,run.output);
        }
        finally { _gate.Release(); }
    }
    private static ProcessStartInfo BaseInfo(string file,string cwd)=>new(){FileName=file,WorkingDirectory=cwd,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true};
}
