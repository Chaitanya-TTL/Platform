using System.Diagnostics;
using System.Text;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using Orchestration.API.Models;
namespace Orchestration.API.Services;
public sealed class SubprocessResult
{
    public bool Success { get; init; }
    public string Output { get; init; } = "";
    public BomRoot? Bom { get; init; }
    public string? BomOutputPath { get; init; }
    public SapBusinessImpactResult? SapImpact { get; init; }
    public string? SapImpactOutputPath { get; init; }
}
public interface ISubprocessExecutor { Task<SubprocessResult> ExecuteAsync(ExtractionRequest request,Func<string,Task> progressCallback); }
public sealed class SubprocessExecutor : ISubprocessExecutor
{
    private readonly ILogger<SubprocessExecutor> _logger; private readonly ExtractorOptions _options; private readonly IProcessRunner _runner; private readonly SemaphoreSlim _sapGate;
    public SubprocessExecutor(ILogger<SubprocessExecutor> logger,IOptions<ExtractorOptions> options,IProcessRunner runner){_logger=logger;_options=options.Value;_runner=runner;_sapGate=new SemaphoreSlim(Math.Max(1,_options.MaxConcurrentSapJobs));}
    public async Task<SubprocessResult> ExecuteAsync(ExtractionRequest request,Func<string,Task> progress)
    {
        try{return request.Kind switch{ExtractionKind.Configit=>await ExecuteConfigitAsync(request,progress),ExtractionKind.Sap=>await ExecuteSapAsync(request,progress),_=>await ExecuteTeamcenterAsync(request,progress)};}
        catch(Exception ex){_logger.LogError(ex,"Subprocess execution error");await progress($"Error: {ex.Message}");return new(){Success=false,Output=ex.Message};}
    }
    private async Task<SubprocessResult> ExecuteSapAsync(ExtractionRequest request,Func<string,Task> progress)
    {
        await _sapGate.WaitAsync();
        try
        {
            var dir=_options.ResolveSapPath();var jar=Path.Combine(dir,"lib","sapjco3.jar");var dll=Path.Combine(dir,"lib","sapjco3.dll");var config=Path.Combine(dir,"config","sap.properties");
            var bomSource=Path.Combine(dir,"src","SapBomExtractor.java");var bomClass=Path.Combine(dir,"out","SapBomExtractor.class");
            var impactSource=Path.Combine(dir,"src","SapMaterialImpactExtractor.java");var impactClass=Path.Combine(dir,"out","SapMaterialImpactExtractor.class");
            foreach(var file in new[]{jar,dll,config,bomSource})if(!File.Exists(file))throw new FileNotFoundException("Required SAP runtime file was not found.",file);
            if(request.IncludeSapBusinessImpact&&!File.Exists(impactSource))throw new FileNotFoundException("SAP impact extractor source was not found.",impactSource);
            var runtime=Path.Combine(dir,"runtime","jobs",SafeSegment(request.JobId??Guid.NewGuid().ToString("N")));Directory.CreateDirectory(runtime);
            var bomPath=Path.Combine(runtime,"sap_bom_extraction.json");if(File.Exists(bomPath))File.Delete(bomPath);
            var output=new StringBuilder();
            await CompileIfNeeded(bomSource,bomClass,jar,dir,progress,output);
            var bomRun=JavaInfo(dir,jar,"SapBomExtractor",request.MaterialId??"",string.IsNullOrWhiteSpace(request.Plant)?"1001":request.Plant,string.IsNullOrWhiteSpace(request.BomUsage)?"3":request.BomUsage,string.IsNullOrWhiteSpace(request.Alternative)?"1":request.Alternative,bomPath);
            await progress($"Extracting SAP BOM for {request.MaterialId}...");var bomExecuted=await _runner.RunAsync(bomRun,TimeSpan.FromSeconds(Math.Max(30,_options.SapTimeoutSeconds)),progress);output.Append(bomExecuted.output);

            BomRoot? bom=null;
            string? bomFailure=null;
            if(bomExecuted.exitCode==0&&File.Exists(bomPath))
            {
                try
                {
                    bom=JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(bomPath));
                    if(bom?.BomRootNode==null){bom=null;bomFailure="SAP extractor produced invalid BOM JSON.";}
                }
                catch(Exception ex){bomFailure=$"SAP BOM JSON could not be parsed: {ex.Message}";}
            }
            else bomFailure=$"SAP BOM extraction was unavailable for material {request.MaterialId}.";

            if(!request.IncludeSapBusinessImpact)
            {
                if(bom==null)return new(){Success=false,Output=AppendReason(output,bomFailure)};
                return new(){Success=true,Output=output.ToString(),Bom=bom,BomOutputPath=bomPath};
            }

            await CompileIfNeeded(impactSource,impactClass,jar,dir,progress,output);
            var requestedMaterial=request.MaterialId?.Trim()??"";
            var materials=bom?.BomRootNode!=null
                ? CollectMaterials(bom.BomRootNode).Where(x=>!string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                : new List<string>{requestedMaterial}.Where(x=>!string.IsNullOrWhiteSpace(x)).ToList();
            var result=new SapBusinessImpactResult{SourceMaterialId=requestedMaterial,Plant=string.IsNullOrWhiteSpace(request.Plant)?"1001":request.Plant,Status="in_progress",ExtractedAt=DateTime.UtcNow.ToString("O")};
            if(bom==null)result.Warnings.Add($"SAP BOM extraction was unavailable for material {requestedMaterial}. Business impact was extracted for the requested material only.");
            var impactDir=Path.Combine(runtime,"impact-items");Directory.CreateDirectory(impactDir);
            for(var i=0;i<materials.Count;i++)
            {
                var material=materials[i];await progress($"Retrieving SAP stock, inventory and cost for {material} ({i+1}/{materials.Count})...");
                var itemPath=Path.Combine(impactDir,$"{SafeSegment(material)}.json");if(File.Exists(itemPath))File.Delete(itemPath);
                var run=JavaInfo(dir,jar,"SapMaterialImpactExtractor",material,result.Plant,itemPath);
                var executed=await _runner.RunAsync(run,TimeSpan.FromSeconds(Math.Max(30,_options.SapTimeoutSeconds)),progress);output.Append(executed.output);
                if(executed.exitCode!=0||!File.Exists(itemPath)){result.Warnings.Add($"Impact extraction failed for {material}.");continue;}
                try{var item=JsonConvert.DeserializeObject<SapMaterialImpact>(await File.ReadAllTextAsync(itemPath));if(item!=null)result.Materials.Add(item);else result.Warnings.Add($"Invalid impact JSON for {material}.");}
                catch(Exception ex){result.Warnings.Add($"Could not parse impact for {material}: {ex.Message}");}
            }
            result.Status=result.Materials.Count==materials.Count&&result.Materials.All(x=>string.Equals(x.Status,"complete",StringComparison.OrdinalIgnoreCase))?"complete":result.Materials.Count>0?"partial_success":"failed";
            result.ExtractedAt=DateTime.UtcNow.ToString("O");
            var impactPath=Path.Combine(runtime,"sap_material_impact.json");await File.WriteAllTextAsync(impactPath,JsonConvert.SerializeObject(result,Formatting.Indented));
            var success=bom!=null||result.Materials.Count>0;
            return new(){Success=success,Output=AppendReason(output,bomFailure),Bom=bom,BomOutputPath=bom==null?null:bomPath,SapImpact=result,SapImpactOutputPath=impactPath};
        }
        finally{_sapGate.Release();}
    }
    private static string AppendReason(StringBuilder output,string? reason)
    {
        if(string.IsNullOrWhiteSpace(reason))return output.ToString();
        if(output.Length>0&&!char.IsWhiteSpace(output[output.Length-1]))output.AppendLine();
        output.AppendLine(reason);return output.ToString();
    }
    private async Task CompileIfNeeded(string source,string cls,string jar,string dir,Func<string,Task> progress,StringBuilder output)
    {
        if(!_options.CompileJavaAtRuntime||(File.Exists(cls)&&File.GetLastWriteTimeUtc(source)<=File.GetLastWriteTimeUtc(cls)))return;
        await progress($"Compiling {Path.GetFileName(source)}...");var info=BaseInfo(_options.JavacExecutable,dir);info.ArgumentList.Add("-cp");info.ArgumentList.Add(jar);info.ArgumentList.Add("-d");info.ArgumentList.Add(Path.Combine(dir,"out"));info.ArgumentList.Add(source);
        var compiled=await _runner.RunAsync(info,TimeSpan.FromSeconds(90),progress);output.Append(compiled.output);if(compiled.exitCode!=0)throw new Exception($"Compilation failed for {Path.GetFileName(source)}.");
    }
    private static IEnumerable<string> CollectMaterials(BomNode root){yield return root.ItemId;foreach(var child in root.Children??new())foreach(var id in CollectMaterials(child))yield return id;}
    private static ProcessStartInfo JavaInfo(string dir,string jar,string className,params string[] args){var info=BaseInfo("java",dir);info.ArgumentList.Add($"-Djava.library.path={Path.Combine(dir,"lib")}");info.ArgumentList.Add("-cp");info.ArgumentList.Add($"{Path.Combine(dir,"out")};{jar}");info.ArgumentList.Add(className);foreach(var arg in args)info.ArgumentList.Add(arg);return info;}
    private async Task<SubprocessResult> ExecuteConfigitAsync(ExtractionRequest request,Func<string,Task> progress){var script=_options.ResolveConfigitPath();var dir=Path.GetDirectoryName(script)!;var outputFile=Path.Combine(dir,"configit_extraction.json");if(File.Exists(outputFile))File.Delete(outputFile);var info=BaseInfo("python",dir);info.ArgumentList.Add(script);info.Environment["PYTHONIOENCODING"]="utf-8";info.Environment["CONFIGIT_WORK_ITEM_ID"]=request.WorkItemId??"";info.Environment["CONFIGIT_PRODUCT_MODEL"]=request.ProductModelCode??"";var run=await _runner.RunAsync(info,TimeSpan.FromSeconds(Math.Max(30,_options.GeneralTimeoutSeconds)),progress);if(run.exitCode!=0||!File.Exists(outputFile))return new(){Success=false,Output=run.output};var bom=JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(outputFile));return new(){Success=bom!=null,Output=run.output,Bom=bom,BomOutputPath=outputFile};}
    private async Task<SubprocessResult> ExecuteTeamcenterAsync(ExtractionRequest request,Func<string,Task> progress){var pipeline=request.PipelinePath??_options.ResolveTeamcenterPath();var dir=Path.GetDirectoryName(pipeline)!;if(!File.Exists(pipeline))throw new FileNotFoundException("Teamcenter pipeline was not found.",pipeline);foreach(var stale in new[]{Path.Combine(dir,"HelloTeamcenter","tc_extraction.json"),Path.Combine(dir,"ConfigitAceIntegration","bom-output.json"),Path.Combine(dir,"ConfigitAceIntegration","tc_extraction.json"),Path.Combine(dir,"tc_extraction.json")})if(File.Exists(stale))File.Delete(stale);var info=BaseInfo("cmd.exe",dir);info.ArgumentList.Add("/c");info.ArgumentList.Add("call");info.ArgumentList.Add(pipeline);info.ArgumentList.Add(request.TeamcenterItemId??"");info.Environment["TC_ITEM_ID"]=request.TeamcenterItemId??"";var run=await _runner.RunAsync(info,TimeSpan.FromSeconds(Math.Max(30,_options.GeneralTimeoutSeconds)),progress);foreach(var path in new[]{Path.Combine(dir,"ConfigitAceIntegration","bom-output.json"),Path.Combine(dir,"HelloTeamcenter","tc_extraction.json"),Path.GetFullPath(Path.Combine(dir,"..","tc_extraction.json"))})if(File.Exists(path)){try{var bom=JsonConvert.DeserializeObject<BomRoot>(await File.ReadAllTextAsync(path));if(bom!=null){bom.SourceItemId=request.TeamcenterItemId??bom.SourceItemId;return new(){Success=true,Output=run.output,Bom=bom,BomOutputPath=path};}}catch(Exception ex){_logger.LogWarning(ex,"Could not parse Teamcenter output {Path}",path);}}return new(){Success=false,Output=run.output};}
    private static ProcessStartInfo BaseInfo(string file,string cwd)=>new(){FileName=file,WorkingDirectory=cwd,UseShellExecute=false,RedirectStandardOutput=true,RedirectStandardError=true,CreateNoWindow=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
    private static string SafeSegment(string value)=>string.Concat(value.Select(c=>char.IsLetterOrDigit(c)||c is '-' or '_'?c:'_'));
}


