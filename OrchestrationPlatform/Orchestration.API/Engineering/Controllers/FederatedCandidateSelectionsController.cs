using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Federation;
namespace Orchestration.API.Engineering.Controllers;

[ApiController][Route("api/engineering/federated/selections")]
public sealed class FederatedCandidateSelectionsController : ControllerBase
{
    private readonly IFederatedDiscoveryJobStore jobs;private readonly IFederatedCandidateSelectionStore selections;
    public FederatedCandidateSelectionsController(IFederatedDiscoveryJobStore jobs,IFederatedCandidateSelectionStore selections){this.jobs=jobs;this.selections=selections;}
    [HttpPost]public IActionResult Post([FromBody]FederatedCandidateSelectionRequest request){if(!jobs.TryGet(request.ParentJobId,out var job)||job is null)return NotFound(new{code="federated-job-not-found"});var result=selections.Record(request,job);return result.Errors.Count>0?BadRequest(result):Ok(result);}
    [HttpGet("{parentJobId}")]public IActionResult Get(string parentJobId)=>selections.TryGet(parentJobId,out var result)?Ok(result):NotFound(new{code="selection-not-found"});
}
