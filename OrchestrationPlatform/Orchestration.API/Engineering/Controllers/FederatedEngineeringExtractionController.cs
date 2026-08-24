using Microsoft.AspNetCore.Mvc;using Orchestration.API.Engineering.Contracts;using Orchestration.API.Engineering.Federation;using Orchestration.API.Engineering.Services;
namespace Orchestration.API.Engineering.Controllers;
[ApiController][Route("api/engineering/federated/extractions")]
public sealed class FederatedEngineeringExtractionController:ControllerBase
{
 readonly IFederatedEngineeringExtractionOrchestrator orchestrator;public FederatedEngineeringExtractionController(IFederatedEngineeringExtractionOrchestrator orchestrator)=>this.orchestrator=orchestrator;
 [HttpPost]public IActionResult Post([FromBody]FederatedEngineeringExtractionRequest request){try{var accepted=orchestrator.Start(request);return AcceptedAtAction(nameof(Get),new{id=accepted.ParentExtractionJobId},accepted);}catch(EngineeringValidationException ex){return BadRequest(new{code=ex.Code,message=ex.Message});}}
 [HttpGet("{id}")]public IActionResult Get(string id)=>orchestrator.TryGet(id,out var job)?Ok(job):NotFound(new{code="federated-extraction-job-not-found"});
 [HttpGet("{id}/result")]public IActionResult Result(string id)=>!orchestrator.TryGet(id,out var job)?NotFound(new{code="federated-extraction-job-not-found"}):job?.Result is null?Accepted(new{id,status=job?.State.ToString()}):Ok(job.Result);
 [HttpPost("{id}/cancel")]public IActionResult Cancel(string id)=>orchestrator.Cancel(id)?Accepted(new{id,status="cancellation-requested"}):Conflict(new{id,code="cancellation-unavailable"});
 [HttpPost("{id}/retry/{source}")]public IActionResult Retry(string id,EngineeringSource source)=>orchestrator.Retry(id,source)?Accepted(new{id,source,status="retry-accepted"}):Conflict(new{id,source,code="retry-unavailable"});
}
