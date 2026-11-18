using System.Diagnostics;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Orchestration.API.AI.Api;

[ApiController]
[Authorize(Policy = "AiRuntime")]
[Route("api/engineering")]
public sealed class EngineeringImpactController(
    IAuthorizationContextProvider authorizationContextProvider,
    IImpactAnswerService impactAnswerService) : ControllerBase
{
    /// <summary>Returns a validated impact answer scoped to the supplied active investigation.</summary>
    [HttpPost("impact-answer")]
    [ProducesResponseType(typeof(ImpactAnswerResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ImpactAnswerResult), StatusCodes.Status422UnprocessableEntity)]
    [ProducesResponseType(typeof(ImpactAnswerResult), StatusCodes.Status502BadGateway)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<ImpactAnswerResult>> Answer(
        [FromBody] ImpactAnswerRequestDto request,
        CancellationToken cancellationToken)
    {
        var activity = Activity.Current;
        var requestContext = new RuntimeRequestContext(
            HttpContext.TraceIdentifier,
            activity?.TraceId.ToHexString() ?? ActivityTraceId.CreateRandom().ToHexString(),
            activity?.ParentId,
            request.ConversationId);

        AuthorizationContextResult authorizationResult;
        try
        {
            authorizationResult = await authorizationContextProvider.CreateAsync(
                User,
                request.InvestigationId,
                requestContext,
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception) when (
            exception is OperationCanceledException or
                HttpRequestException or
                TimeoutException or
                InvalidOperationException or
                Azure.RequestFailedException or
                Azure.Identity.AuthenticationFailedException)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Authorization service unavailable",
                detail: "The authorization decision could not be completed.");
        }

        if (authorizationResult is not AuthorizationContextResult.Authorized authorized)
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var result = await impactAnswerService.AnswerAsync(
            new ImpactAnswerRequest(request.InvestigationId, request.Question, request.ConversationId),
            authorized.Context,
            requestContext,
            cancellationToken);

        return result.Disposition switch
        {
            AnswerDisposition.Answer => Ok(result),
            AnswerDisposition.Clarify or AnswerDisposition.Abstain =>
                UnprocessableEntity(result),
            AnswerDisposition.Deny => StatusCode(StatusCodes.Status403Forbidden),
            _ => StatusCode(StatusCodes.Status502BadGateway, result)
        };
    }
}
