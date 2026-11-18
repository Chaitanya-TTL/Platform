using System.Diagnostics;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Telemetry;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Orchestration.API.AI.Api;

[ApiController]
[Authorize(Policy = "AiRuntime")]
[Route("api/engineering")]
public sealed class EngineeringImpactController(
    IAuthorizationContextProvider authorizationContextProvider,
    IImpactAnswerService impactAnswerService,
    IAiRuntimeTelemetry telemetry) : ControllerBase
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
        using var fallbackActivity = Activity.Current is { IdFormat: ActivityIdFormat.W3C }
            ? null
            : new Activity("lattice.answer.ingress")
                .SetIdFormat(ActivityIdFormat.W3C)
                .Start();
        var activity = Activity.Current!;
        var requestId = string.IsNullOrWhiteSpace(HttpContext.TraceIdentifier)
            ? Guid.NewGuid().ToString("N")
            : HttpContext.TraceIdentifier;
        var requestContext = new RuntimeRequestContext(
            requestId,
            activity.TraceId.ToHexString(),
            activity.ParentId,
            request.ConversationId);
        using var requestStage = telemetry.StartStage(
            "answer.request",
            requestContext,
            request.InvestigationId);

        AuthorizationContextResult authorizationResult;
        using (var authorizationStage = telemetry.StartStage(
            "authorization",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                authorizationResult = await authorizationContextProvider.CreateAsync(
                    User,
                    request.InvestigationId,
                    requestContext,
                    cancellationToken);
                authorizationStage.SetDisposition(
                    authorizationResult is AuthorizationContextResult.Authorized ? "authorized" : "deny");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                authorizationStage.SetFailure("other");
                authorizationStage.SetDisposition("cancelled");
                requestStage.SetFailure("other");
                requestStage.SetDisposition("cancelled");
                telemetry.RecordRequestOutcome("cancelled");
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
                authorizationStage.SetFailure("authorization-unavailable");
                requestStage.SetFailure("authorization-unavailable");
                telemetry.RecordRequestOutcome("failed");
                return Problem(
                    statusCode: StatusCodes.Status503ServiceUnavailable,
                    title: "Authorization service unavailable",
                    detail: "The authorization decision could not be completed.");
            }
        }

        if (authorizationResult is not AuthorizationContextResult.Authorized authorized)
        {
            requestStage.SetDisposition("deny");
            telemetry.RecordRequestOutcome("deny");
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var outcomeRecorded = false;
        try
        {
            var result = await impactAnswerService.AnswerAsync(
                new ImpactAnswerRequest(request.InvestigationId, request.Question, request.ConversationId),
                authorized.Context,
                requestContext,
                cancellationToken);

            requestStage.SetDisposition(result.Disposition.ToString());
            telemetry.RecordRequestOutcome(result.Disposition.ToString());
            outcomeRecorded = true;
            return result.Disposition switch
            {
                AnswerDisposition.Answer => Ok(result),
                AnswerDisposition.Clarify or AnswerDisposition.Abstain =>
                    UnprocessableEntity(result),
                AnswerDisposition.Deny => StatusCode(StatusCodes.Status403Forbidden),
                _ => StatusCode(StatusCodes.Status502BadGateway, result)
            };
        }
        finally
        {
            if (!outcomeRecorded)
            {
                requestStage.SetFailure("other");
                var disposition = cancellationToken.IsCancellationRequested ? "cancelled" : "failed";
                if (disposition == "cancelled")
                {
                    requestStage.SetDisposition(disposition);
                }
                telemetry.RecordRequestOutcome(disposition);
            }
        }
    }
}
