using Microsoft.AspNetCore.Mvc;using Orchestration.API.Engineering.Adapters.Codebeamer;
namespace Orchestration.API.Engineering.Controllers;
[ApiController][Route("api/engineering/codebeamer")]
public sealed class CodebeamerCatalogController:ControllerBase
{
 readonly ICodebeamerCliClient client;public CodebeamerCatalogController(ICodebeamerCliClient client)=>this.client=client;
 [HttpGet("status")]public async Task<IActionResult> Status(CancellationToken token)=>Ok(await client.StatusAsync(token));
 [HttpGet("search")]public async Task<IActionResult> Search([FromQuery]string query,CancellationToken token,[FromQuery]int limit=25){if(string.IsNullOrWhiteSpace(query))return BadRequest(new{error="query is required"});return Ok(await client.SearchAsync(query,limit,token));}
}

