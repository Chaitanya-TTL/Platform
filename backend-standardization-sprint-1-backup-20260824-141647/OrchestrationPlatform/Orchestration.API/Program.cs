using Orchestration.API.Models;
using Orchestration.API.Services;
using System.Text.Json.Serialization;
var builder=WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(options=>
{
    options.JsonSerializerOptions.DefaultIgnoreCondition=JsonIgnoreCondition.WhenWritingNull;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.KebabCaseLower));
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.Configure<ExtractorOptions>(builder.Configuration.GetSection("Extractors"));
builder.Services.AddSingleton<IJobStore,InMemoryJobStore>();
builder.Services.AddSingleton<IAuditLogger,FileAuditLogger>();
builder.Services.AddSingleton<IProcessRunner,ProcessRunner>();
builder.Services.AddSingleton<ISapCapabilityProbeService,SapCapabilityProbeService>();
builder.Services.AddSingleton<ISapExecutionValidationService,SapExecutionValidationService>();
builder.Services.AddSingleton<ISapMaterialCatalogService,SapMaterialCatalogService>();
builder.Services.AddSingleton<ISubprocessExecutor,SubprocessExecutor>();
builder.Services.AddSingleton<IPipelineOrchestrator,PipelineOrchestrator>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Services.IEngineeringQueryNormalizer,Orchestration.API.Engineering.Services.EngineeringQueryNormalizer>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Services.IEngineeringRequestValidator,Orchestration.API.Engineering.Services.EngineeringRequestValidator>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Services.IEngineeringJobStore,Orchestration.API.Engineering.Services.EngineeringJobStore>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Services.IEngineeringCancellationRegistry,Orchestration.API.Engineering.Services.EngineeringCancellationRegistry>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Services.ISafeEngineeringDiagnostics,Orchestration.API.Engineering.Services.SafeEngineeringDiagnostics>();
builder.Services.Configure<Orchestration.API.Engineering.Adapters.Teamcenter.TeamcenterArtifactCaptureOptions>(builder.Configuration.GetSection("Engineering:TeamcenterArtifacts"));
builder.Services.AddSingleton<Orchestration.API.Engineering.Adapters.Teamcenter.ITeamcenterFailureClassifier,Orchestration.API.Engineering.Adapters.Teamcenter.TeamcenterFailureClassifier>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Adapters.Teamcenter.ITeamcenterArtifactCaptureService,Orchestration.API.Engineering.Adapters.Teamcenter.TeamcenterArtifactCaptureService>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Adapters.IEngineeringSourceAdapter,Orchestration.API.Engineering.Adapters.Teamcenter.TeamcenterEngineeringAdapter>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Adapters.IEngineeringAdapterRegistry,Orchestration.API.Engineering.Adapters.EngineeringAdapterRegistry>();
builder.Services.AddSingleton<Orchestration.API.Engineering.Services.IEngineeringExecutionService,Orchestration.API.Engineering.Services.EngineeringExecutionService>();

builder.Services.AddCors(options=>options.AddPolicy("AllowAll",policy=>policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));
var app=builder.Build();
if(app.Environment.IsDevelopment()){app.UseSwagger();app.UseSwaggerUI();}
app.UseCors("AllowAll");
app.UseHttpsRedirection();
app.MapControllers();
app.Run();
