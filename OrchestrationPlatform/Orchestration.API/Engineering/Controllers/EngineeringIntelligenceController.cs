using Microsoft.AspNetCore.Mvc;using Orchestration.API.Engineering.Contracts;using Orchestration.API.Engineering.Intelligence;
namespace Orchestration.API.Engineering.Controllers;
[ApiController][Route("api/engineering/intelligence")]
public sealed class EngineeringIntelligenceController(IEngineeringIntelligenceInvestigationAssembler assembler):ControllerBase
{
 [HttpPost("assemble")]public IActionResult Assemble([FromBody]UnifiedProductIntelligence input){try{return Ok(assembler.Assemble(input));}catch(InvalidOperationException ex){return UnprocessableEntity(new{code="intelligence-investigation-invalid",message=ex.Message});}}
}
