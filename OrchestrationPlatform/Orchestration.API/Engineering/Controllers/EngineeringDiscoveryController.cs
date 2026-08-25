using Microsoft.AspNetCore.Mvc;
using Orchestration.API.Engineering.Contracts;
using Orchestration.API.Engineering.Services;
namespace Orchestration.API.Engineering.Controllers;
[ApiController][Route("api/engineering/discovery")]
public sealed class EngineeringDiscoveryController:ControllerBase { readonly IEngineeringExecutionService service; public EngineeringDiscoveryController(IEngineeringExecutionService service)=>this.service=service; [HttpPost] public async Task<IActionResult> Post([FromBody]EngineeringDiscoveryRequest request,CancellationToken token){var result=await service.DiscoverAsync(request,token);return result.Sources.Any(x=>x.Errors.Any(e=>e.Stage==EngineeringStage.Validation))?BadRequest(result):Ok(result);} }
