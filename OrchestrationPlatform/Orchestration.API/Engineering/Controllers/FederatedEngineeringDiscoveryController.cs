using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Federation;
using Orchestration.API.Engineering.Services;
namespace Orchestration.API.Engineering.Controllers;

[ApiController][Route("api/engineering/federated/discovery")]
public sealed class FederatedEngineeringDiscoveryController : ControllerBase
{
    private readonly IFederatedEngineeringDiscoveryOrchestrator orchestrator;
    public FederatedEngineeringDiscoveryController(IFederatedEngineeringDiscoveryOrchestrator orchestrator)=>this.orchestrator=orchestrator;
    [HttpPost] public IActionResult Post([FromBody]FederatedEngineeringDiscoveryRequest request,CancellationToken token)
    {try{var accepted=orchestrator.Start(request,token);return AcceptedAtAction(nameof(FederatedEngineeringJobsController.Get),"FederatedEngineeringJobs",new{jobId=accepted.ParentJobId},accepted);}catch(EngineeringValidationException ex){return BadRequest(new{code=ex.Code,message=ex.Message});}}
}
