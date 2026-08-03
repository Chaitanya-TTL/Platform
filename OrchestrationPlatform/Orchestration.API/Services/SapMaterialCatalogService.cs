using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Orchestration.API.Models;
namespace Orchestration.API.Services;
public interface ISapMaterialCatalogService
{
    Task<(SapMaterialCatalogResult result,string jsonPath,string csvPath,string processOutput)> ExtractAsync(string prefix,int maxRows,CancellationToken token);
}
public sealed class SapMaterialCatalogService : ISapMaterialCatalogService
{
    private readonly ExtractorOptions _options;
    private readonly IProcessRunner _runner;
    private readonly SemaphoreSlim _gate;
    public SapMaterialCatalogService(IOptions<ExtractorOptions> options,IProcessRunner runner)
    {
        _options=options.Value;
        _runner=runner;
        _gate=new SemaphoreSlim(Math.Max(1,_options.MaxConcurrentSapJobs));
    }
    public async Task<(SapMaterialCatalogResult result,string jsonPath,string csvPath,string processOutput)> ExtractAsync(string prefix,int maxRows,CancellationToken token)
    {
        await _gate.WaitAsync(token);
        try
        {
            var dir=_options.ResolveSapPath();
            var jar=Path.Combine(dir,"lib","sapjco3.jar");
            var dll=Path.Combine(dir,"lib","sapjco3.dll");
            var config=Path.Combine(dir,"config","sap.properties");
            var source=Path.Combine(dir,"src","SapMaterialCatalogExtractor.java");
            var cls=Path.Combine(dir,"out","SapMaterialCatalogExtractor.class");
            foreach(var file in new[]{jar,dll,config,source})
                if(!File.Exists(file)) throw new FileNotFoundException("Required SAP material catalog file not found.",file);

            var runId=$"catalog_{DateTime.UtcNow:yyyyMMdd_HHmmss}_{Guid.NewGuid():N}";
            var outputDir=Path.Combine(dir,"runtime","catalog",runId);
            Directory.CreateDirectory(outputDir);
            var jsonPath=Path.Combine(outputDir,"sap_material_catalog.json");
            var csvPath=Path.Combine(outputDir,"sap_material_catalog.csv");

            if(_options.CompileJavaAtRuntime&&(!File.Exists(cls)||File.GetLastWriteTimeUtc(source)>File.GetLastWriteTimeUtc(cls)))
            {
                var compile=Info(_options.JavacExecutable,dir);
                compile.ArgumentList.Add("-cp");compile.ArgumentList.Add(jar);
                compile.ArgumentList.Add("-d");compile.ArgumentList.Add(Path.Combine(dir,"out"));
                compile.ArgumentList.Add(source);
                var compiled=await _runner.RunAsync(compile,TimeSpan.FromSeconds(90),_=>Task.CompletedTask,token);
                if(compiled.exitCode!=0) throw new InvalidOperationException("SAP material catalog compilation failed. "+compiled.output);
            }

            var run=Info(_options.JavaExecutable,dir);
            run.ArgumentList.Add($"-Djava.library.path={Path.Combine(dir,"lib")}");
            run.ArgumentList.Add("-cp");run.ArgumentList.Add($"{Path.Combine(dir,"out")};{jar}");
            run.ArgumentList.Add("SapMaterialCatalogExtractor");
            run.ArgumentList.Add(prefix??"");
            run.ArgumentList.Add(Math.Max(0,maxRows).ToString());
            run.ArgumentList.Add(outputDir);
            var executed=await _runner.RunAsync(run,TimeSpan.FromSeconds(Math.Max(60,_options.GeneralTimeoutSeconds)),_=>Task.CompletedTask,token);
            if(executed.exitCode!=0) throw new InvalidOperationException("SAP material catalog extraction failed. "+executed.output);
            if(!File.Exists(jsonPath)||!File.Exists(csvPath)) throw new InvalidOperationException("SAP material catalog extraction did not create both JSON and CSV outputs.");

            var result=JsonSerializer.Deserialize<SapMaterialCatalogResult>(
                await File.ReadAllTextAsync(jsonPath,token),
                new JsonSerializerOptions{PropertyNameCaseInsensitive=true})
                ?? throw new InvalidOperationException("SAP material catalog JSON was invalid.");
            return(result,jsonPath,csvPath,executed.output);
        }
        finally{_gate.Release();}
    }
    private static ProcessStartInfo Info(string file,string cwd)=>new()
    {
        FileName=file,WorkingDirectory=cwd,UseShellExecute=false,
        RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true
    };
}
