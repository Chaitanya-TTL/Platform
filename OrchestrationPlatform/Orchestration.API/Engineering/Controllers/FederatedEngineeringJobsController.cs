using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Federation;
namespace Orchestration.API.Engineering.Controllers;

[ApiController][Route("api/engineering/federated/jobs")]
public sealed class FederatedEngineeringJobsController : ControllerBase
{
    private readonly IFederatedEngineeringDiscoveryOrchestrator orchestrator;
    public FederatedEngineeringJobsController(IFederatedEngineeringDiscoveryOrchestrator orchestrator)=>this.orchestrator=orchestrator;
    [HttpGet("{jobId}")] public IActionResult Get(string jobId)=>orchestrator.TryGet(jobId,out var snapshot)?Ok(snapshot):NotFound(new{code="federated-job-not-found",message="Federated job was not found."});
    [HttpPost("{jobId}/cancel")] public IActionResult Cancel(string jobId)=>orchestrator.Cancel(jobId)?Accepted(new{jobId,status="cancellation-requested"}):Conflict(new{jobId,code="cancellation-unavailable"});
    [HttpPost("{jobId}/retry/{source}")] public IActionResult Retry(string jobId,EngineeringSource source)=>orchestrator.Retry(jobId,source)?Accepted(new{jobId,source,status="retry-accepted"}):Conflict(new{jobId,source,code="retry-unavailable"});
}
