using Orchestration.API.Models;
using Orchestration.API.Services;
using System.Text.Json.Serialization;
var builder=WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(options=>
{
    options.JsonSerializerOptions.DefaultIgnoreCondition=JsonIgnoreCondition.WhenWritingNull;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
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
builder.Services.AddCors(options=>options.AddPolicy("AllowAll",policy=>policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));
var app=builder.Build();
if(app.Environment.IsDevelopment()){app.UseSwagger();app.UseSwaggerUI();}
app.UseCors("AllowAll");
app.UseHttpsRedirection();
app.MapControllers();
app.Run();
