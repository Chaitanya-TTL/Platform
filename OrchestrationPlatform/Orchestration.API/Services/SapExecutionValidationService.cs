using System.Diagnostics;
using Microsoft.Extensions.Options;
using System.Text.Json;
using Orchestration.API.Models;
namespace Orchestration.API.Services;
public interface ISapExecutionValidationService
{
    Task<(SapExecutionValidationReport report,string outputPath,string processOutput)> RunAsync(string materialId,string plant,CancellationToken token);
}
public sealed class SapExecutionValidationService : ISapExecutionValidationService
{
    private readonly ExtractorOptions _options; private readonly IProcessRunner _runner; private readonly SemaphoreSlim _gate;
    public SapExecutionValidationService(IOptions<ExtractorOptions> options,IProcessRunner runner)
    { _options=options.Value;_runner=runner;_gate=new SemaphoreSlim(Math.Max(1,_options.MaxConcurrentSapJobs)); }
    public async Task<(SapExecutionValidationReport report,string outputPath,string processOutput)> RunAsync(string materialId,string plant,CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            var dir=_options.ResolveSapPath();var jar=Path.Combine(dir,"lib","sapjco3.jar");var dll=Path.Combine(dir,"lib","sapjco3.dll");
            var config=Path.Combine(dir,"config","sap.properties");var source=Path.Combine(dir,"src","SapMaterialImpactExecutionProbe.java");var cls=Path.Combine(dir,"out","SapMaterialImpactExecutionProbe.class");
            foreach(var file in new[]{jar,dll,config,source})if(!File.Exists(file))throw new FileNotFoundException("Required SAP validation file not found.",file);
            var id=$"validation_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}";var runtime=Path.Combine(dir,"runtime","validation",id);Directory.CreateDirectory(runtime);
            var output=Path.Combine(runtime,"sap_material_impact_execution.json");
            if(_options.CompileJavaAtRuntime&&(!File.Exists(cls)||File.GetLastWriteTimeUtc(source)>File.GetLastWriteTimeUtc(cls)))
            {
                var compile=Info(_options.JavacExecutable,dir);compile.ArgumentList.Add("-cp");compile.ArgumentList.Add(jar);compile.ArgumentList.Add("-d");compile.ArgumentList.Add(Path.Combine(dir,"out"));compile.ArgumentList.Add(source);
                var result=await _runner.RunAsync(compile,TimeSpan.FromSeconds(90),_=>Task.CompletedTask,token);if(result.exitCode!=0)throw new InvalidOperationException("SAP validation probe compilation failed. "+result.output);
            }
            var runInfo=Info(_options.JavaExecutable,dir);runInfo.ArgumentList.Add($"-Djava.library.path={Path.Combine(dir,"lib")}");runInfo.ArgumentList.Add("-cp");runInfo.ArgumentList.Add($"{Path.Combine(dir,"out")};{jar}");
            runInfo.ArgumentList.Add("SapMaterialImpactExecutionProbe");runInfo.ArgumentList.Add(materialId);runInfo.ArgumentList.Add(plant);runInfo.ArgumentList.Add(output);
            var run=await _runner.RunAsync(runInfo,TimeSpan.FromSeconds(Math.Max(30,_options.SapTimeoutSeconds)),_=>Task.CompletedTask,token);
            if(run.exitCode!=0)throw new InvalidOperationException("SAP execution validation failed. "+run.output);if(!File.Exists(output))throw new FileNotFoundException("Validation JSON was not created.",output);
            var report=JsonSerializer.Deserialize<SapExecutionValidationReport>(await File.ReadAllTextAsync(output,token),new JsonSerializerOptions{PropertyNameCaseInsensitive=true})??throw new InvalidOperationException("Validation JSON was invalid.");
            return(report,output,run.output);
        }
        finally{_gate.Release();}
    }
    private static ProcessStartInfo Info(string file,string cwd)=>new(){FileName=file,WorkingDirectory=cwd,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true};
}
