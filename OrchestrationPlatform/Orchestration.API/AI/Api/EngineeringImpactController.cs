using System.Diagnostics;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Telemetry;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Orchestration.API.AI.Telemetry;

namespace Orchestration.API.AI.Api;

[ApiController]
[Authorize(Policy = "AiRuntime")]
[Route("api/engineering")]
public sealed class EngineeringImpactController(
    IAuthorizationContextProvider authorizationContextProvider,
    IImpactAnswerService impactAnswerService,
    IAiRuntimeTelemetry telemetry,
    ICopilotExecutionTrace? executionTrace = null,
    IOptions<CopilotExecutionTraceOptions>? traceOptions = null,
    IHostEnvironment? hostEnvironment = null,
    ILogger<EngineeringImpactController>? logger = null) : ControllerBase
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
        var traceParent = HttpContext.Request.Headers["traceparent"].ToString();
        var hasValidTraceParent = ActivityContext.TryParse(traceParent, null, isRemote: true, out var parentContext);
        Activity? requestActivity = null;
        if (hasValidTraceParent)
        {
            requestActivity = new Activity("lattice.answer.ingress")
                .SetParentId(parentContext.TraceId, parentContext.SpanId, parentContext.TraceFlags)
                .Start();
        }
        else if (Activity.Current is not { IdFormat: ActivityIdFormat.W3C })
        {
            requestActivity = new Activity("lattice.answer.ingress")
                .SetIdFormat(ActivityIdFormat.W3C)
                .Start();
        }

        using var activityScope = requestActivity;
        var activity = Activity.Current!;
        var propagatedRequestId = HttpContext.Request.Headers["X-Copilot-Request-Id"].ToString();
        var requestIdHeaderAccepted = IsSafeRequestId(propagatedRequestId);
        var requestId = requestIdHeaderAccepted
            ? propagatedRequestId
            : string.IsNullOrWhiteSpace(HttpContext.TraceIdentifier)
            ? Guid.NewGuid().ToString("N")
            : HttpContext.TraceIdentifier;
        var routeSource = ReadRouteSource(HttpContext.Request.Headers["X-Copilot-Route-Source"].ToString());
        var snapshotHeader = HttpContext.Request.Headers["X-Copilot-Snapshot-Revision"].ToString();
        var snapshotRevisionAccepted = int.TryParse(snapshotHeader, out var snapshotRevision) && snapshotRevision >= 0;
        var fullPayloadTraceRequested =
            string.Equals(
                HttpContext.Request.Headers["X-Copilot-Diagnostic-Detail"].ToString(),
                "full",
                StringComparison.OrdinalIgnoreCase);
        var fullPayloadTraceEnabled =
            fullPayloadTraceRequested &&
            traceOptions?.Value.FullPayloadTraceEnabled == true &&
            hostEnvironment is not null &&
            !hostEnvironment.IsProduction();
        var requestContext = new RuntimeRequestContext(
            requestId,
            activity.TraceId.ToHexString(),
            activity.ParentId,
            request.ConversationId)
        {
            TurnId = request.TurnId,
            RouteSource = routeSource,
            SnapshotRevision = snapshotRevisionAccepted ? snapshotRevision : null,
            FullPayloadTraceEnabled = fullPayloadTraceEnabled
        };
        WriteTrace(
            requestContext,
            "request.received",
            "runtime.ingress",
            request.InvestigationId,
            outcome: "started",
            input: new { questionCharacters = request.Question.Length },
            fullPayload: new { question = request.Question },
            diagnostics: new
            {
                requestIdHeaderAccepted,
                traceParentHeaderAccepted = hasValidTraceParent,
                snapshotRevisionHeaderAccepted = snapshotRevisionAccepted,
                fullPayloadTraceRequested,
                fullPayloadTraceEnabled
            });
        using var requestStage = telemetry.StartStage(
            "answer.request",
            requestContext,
            request.InvestigationId);

        AuthorizationContextResult authorizationResult;
        var authorizationStartedAt = Stopwatch.GetTimestamp();
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
                    authorizationResult switch
                    {
                        AuthorizationContextResult.Authorized => "authorized",
                        AuthorizationContextResult.Denied
                        {
                            Code: AuthorizationDenialCode.MissingProviderConfiguration
                        } => "authorization-unavailable",
                        _ => "deny"
                    });
                WriteTrace(
                    requestContext,
                    "authorization.completed",
                    "authorization",
                    request.InvestigationId,
                    outcome: authorizationResult is AuthorizationContextResult.Authorized ? "authorized" : "denied",
                    durationMs: (long)Stopwatch.GetElapsedTime(authorizationStartedAt).TotalMilliseconds,
                    output: new
                    {
                        result = authorizationResult.GetType().Name,
                        grants = authorizationResult is AuthorizationContextResult.Authorized granted
                            ? granted.Context.Scope.Grants.Order(StringComparer.Ordinal).ToArray()
                            : Array.Empty<string>()
                    });
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                WriteTrace(requestContext, "authorization.cancelled", "authorization", request.InvestigationId, outcome: "cancelled");
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
                WriteTrace(
                    requestContext,
                    "authorization.failed",
                    "authorization",
                    request.InvestigationId,
                    outcome: "unavailable",
                    durationMs: (long)Stopwatch.GetElapsedTime(authorizationStartedAt).TotalMilliseconds,
                    diagnostics: new { errorType = exception.GetType().Name });
                authorizationStage.SetFailure("authorization-unavailable");
                requestStage.SetFailure("authorization-unavailable");
                telemetry.RecordRequestOutcome("failed");
                return AuthorizationUnavailable("AI_RUNTIME_AUTHORIZATION_PROVIDER_UNAVAILABLE");
            }
        }

        if (authorizationResult is AuthorizationContextResult.Denied
            {
                Code: AuthorizationDenialCode.MissingProviderConfiguration
            })
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "runtime",
                request.InvestigationId,
                outcome: "authorization-unavailable",
                output: new { statusCode = StatusCodes.Status503ServiceUnavailable });
            requestStage.SetFailure("authorization-unavailable");
            requestStage.SetDisposition("failed");
            telemetry.RecordRequestOutcome("failed");
            return AuthorizationUnavailable("AI_RUNTIME_AUTHORIZATION_PROVIDER_NOT_CONFIGURED");
        }

        if (authorizationResult is not AuthorizationContextResult.Authorized authorized)
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "runtime",
                request.InvestigationId,
                outcome: "denied",
                output: new { statusCode = StatusCodes.Status403Forbidden });
            requestStage.SetDisposition("deny");
            telemetry.RecordRequestOutcome("deny");
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        var outcomeRecorded = false;
        try
        {
            var result = await impactAnswerService.AnswerAsync(
                new ImpactAnswerRequest(request.InvestigationId, request.Question, request.ConversationId)
                {
                    ParentTurnId = request.ParentTurnId,
                    PreviousConversationState = request.PreviousConversationState,
                    ConversationHistory = request.ConversationHistory
                },
                authorized.Context,
                requestContext,
                cancellationToken);

            requestStage.SetDisposition(result.Disposition.ToString());
            WriteTrace(
                requestContext,
                "answer.completed",
                "runtime",
                request.InvestigationId,
                outcome: result.Disposition.ToString(),
                output: new
                {
                    result.Disposition,
                    issueCodes = result.Issues.Select(issue => issue.Code).ToArray(),
                    result.ContextPackageId
                },
                fullPayload: result);
            telemetry.RecordRequestOutcome(result.Disposition.ToString());
            telemetry.RecordConversationTurnDisposition(result.Disposition);
            outcomeRecorded = true;
            var statusCode = result.Disposition switch
            {
                AnswerDisposition.Answer => StatusCodes.Status200OK,
                AnswerDisposition.Clarify or AnswerDisposition.Abstain => StatusCodes.Status422UnprocessableEntity,
                AnswerDisposition.Deny => StatusCodes.Status403Forbidden,
                _ => StatusCodes.Status502BadGateway
            };
            WriteTrace(
                requestContext,
                "response.returned",
                "runtime.response",
                request.InvestigationId,
                outcome: result.Disposition.ToString(),
                output: new { statusCode });
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
                WriteTrace(
                    requestContext,
                    "request.completed",
                    "runtime",
                    request.InvestigationId,
                    outcome: disposition);
                telemetry.RecordRequestOutcome(disposition);
            }
        }
    }

    private ObjectResult AuthorizationUnavailable(string code)
    {
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status503ServiceUnavailable,
            Title = "Authorization service unavailable",
            Detail = "The authorization decision could not be completed."
        };
        problem.Extensions["code"] = code;
        return StatusCode(StatusCodes.Status503ServiceUnavailable, problem);
    }

    private void WriteTrace(
        RuntimeRequestContext requestContext,
        string eventName,
        string stage,
        string? investigationId,
        string? outcome = null,
        long? durationMs = null,
        object? input = null,
        object? output = null,
        object? fullPayload = null,
        object? diagnostics = null)
    {
        if (executionTrace is null) return;

        try
        {
            executionTrace.Write(CopilotExecutionTraceEventFactory.Create(
                requestContext,
                eventName,
                stage,
                investigationId,
                requestContext.SnapshotRevision,
                outcome,
                durationMs,
                input,
                output,
                fullPayload,
                diagnostics));
        }
        catch (Exception exception)
        {
            try
            {
                logger?.LogError(
                    "Copilot execution trace event creation failed ({ExceptionType}).",
                    exception.GetType().Name);
            }
            catch
            {
                // Diagnostic logging must not affect answer execution.
            }
        }
    }

    private static bool IsSafeRequestId(string value) =>
        value.Length is > 0 and <= 128 &&
        value.All(character =>
            char.IsAsciiLetterOrDigit(character) ||
            character is '.' or '_' or ':' or '-');

    private static string ReadRouteSource(string value) =>
        value is "LegacyFrontend" or "UnifiedRuntime" or "ImpactRuntime" or "FactRuntime" or "DocumentRuntime"
            ? value
            : "Unknown";
}
