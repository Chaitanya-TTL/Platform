using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Lattice.AI.Runtime.Application;
using Lattice.AI.Runtime.Authorization;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.Telemetry;
using Lattice.AI.Runtime.Validation;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Orchestration.API.AI.Api;
using Orchestration.API.AI.Telemetry;

namespace Lattice.AI.Runtime.Tests.Telemetry;

public sealed class AiRuntimeTelemetryTests
{
    [Fact]
    public async Task AnswerStagesShareRequestCorrelationAndExcludeSensitivePayloads()
    {
        using var capture = new TelemetryCapture();
        using var parent = new Activity("test.http").SetIdFormat(ActivityIdFormat.W3C).Start();
        var telemetry = new AiRuntimeTelemetry();
        var requestContext = new RuntimeRequestContext(
            "request-telemetry-1",
            parent.TraceId.ToHexString(),
            parent.ParentId,
            "conversation-telemetry-1");
        var fixture = new Fixture(telemetry);
        using (var request = telemetry.StartStage("answer.request", requestContext, "investigation-1"))
        using (var authorization = telemetry.StartStage("authorization", requestContext, "investigation-1"))
        {
            authorization.SetDisposition("authorized");
            var result = await fixture.Service.AnswerAsync(
                new ImpactAnswerRequest(
                    "investigation-1",
                    "What impacts if REQ-123 changes? PROMPT_PRIVATE_MARKER",
                    "conversation-telemetry-1"),
                Authorization(),
                requestContext,
                CancellationToken.None);
            request.SetDisposition(result.Disposition.ToString());
            telemetry.RecordRequestOutcome(result.Disposition.ToString());
        }

        var stages = capture.Activities
            .Where(activity => activity.GetTagItem("lattice.request.id") is "request-telemetry-1")
            .ToArray();
        var requiredStages = new[]
        {
            "answer.request",
            "authorization",
            "entity-resolution",
            "plm-retrieval",
            "context-compilation",
            "prompt",
            "model-generation",
            "validation"
        };
        Assert.All(requiredStages, name => Assert.Contains(stages, stage => stage.OperationName == name));
        Assert.All(stages, stage =>
        {
            Assert.Equal(requestContext.RequestId, stage.GetTagItem("lattice.request.id"));
            Assert.Equal(requestContext.TraceId, stage.GetTagItem("lattice.trace.id"));
            Assert.Equal(parent.TraceId, stage.TraceId);
        });

        var promptStage = Assert.Single(stages, stage => stage.OperationName == "prompt");
        Assert.Equal("engineering-impact", promptStage.GetTagItem("prompt.id"));
        Assert.Equal("v1", promptStage.GetTagItem("prompt.version"));
        var compilationStage = Assert.Single(stages, stage => stage.OperationName == "context-compilation");
        Assert.Equal("compiler-v1", compilationStage.GetTagItem("context.compiler.version"));
        Assert.StartsWith(
            "context-",
            Assert.IsType<string>(compilationStage.GetTagItem("context.package.id")));
        var modelStage = Assert.Single(stages, stage => stage.OperationName == "model-generation");
        Assert.Equal("model-config-telemetry-1", modelStage.GetTagItem("model.configuration_id"));
        Assert.Contains(
            capture.Measurements,
            measurement => measurement.Name == "lattice.ai.runtime.request.outcomes" &&
                           measurement.Tags.Any(tag => tag.Key == "disposition" && Equals(tag.Value, "answer")));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.stage.duration" &&
            measurement.Tags.Any(tag => tag.Key == "stage" && Equals(tag.Value, "plm-retrieval")));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.validation.dispositions" &&
            measurement.Tags.Any(tag => tag.Key == "disposition" && Equals(tag.Value, "accept")));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.model.tokens" &&
            Equals(measurement.Value, 11L));
        Assert.Contains(stages.SelectMany(stage => stage.Events), activityEvent =>
            activityEvent.Name == "stage.completed");

        var telemetryText = string.Join(
            '\n',
            stages.SelectMany(activity => new[]
                {
                    activity.DisplayName,
                    activity.StatusDescription
                }.Concat(activity.Tags.Select(tag => tag.Value?.ToString())))
                .Concat(stages.SelectMany(activity => activity.Events)
                    .SelectMany(activityEvent => activityEvent.Tags.Select(tag => tag.Value?.ToString())))
                .Concat(capture.Measurements.SelectMany(measurement => measurement.Tags.Select(tag => tag.Value?.ToString()))));
        Assert.DoesNotContain("PROMPT_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("ANSWER_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("EVIDENCE_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("BEARER_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("SIGNED_TOKEN_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("CLAIM_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ModelFailureEmitsSanitizedFailureAndFailedDisposition()
    {
        using var capture = new TelemetryCapture();
        using var parent = new Activity("test.http.error").SetIdFormat(ActivityIdFormat.W3C).Start();
        var telemetry = new AiRuntimeTelemetry();
        var requestContext = new RuntimeRequestContext(
            "request-telemetry-error",
            parent.TraceId.ToHexString(),
            parent.ParentId,
            null);
        var fixture = new Fixture(
            telemetry,
            modelFailure: new HttpRequestException("ERROR_PRIVATE_MARKER"));

        using (var request = telemetry.StartStage("answer.request", requestContext, "investigation-1"))
        {
            var result = await fixture.Service.AnswerAsync(
                new ImpactAnswerRequest("investigation-1", "What impacts if REQ-123 changes?"),
                Authorization(),
                requestContext,
                CancellationToken.None);
            request.SetDisposition(result.Disposition.ToString());
            telemetry.RecordRequestOutcome(result.Disposition.ToString());
            Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        }

        var modelStage = Assert.Single(capture.Activities, activity =>
            activity.OperationName == "model-generation" &&
            activity.GetTagItem("lattice.request.id") is "request-telemetry-error");
        Assert.Equal(ActivityStatusCode.Error, modelStage.Status);
        Assert.Equal("model-provider-failed", modelStage.GetTagItem("error.type"));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.failures" &&
            measurement.Tags.Any(tag => tag.Key == "failure.category" &&
                                        Equals(tag.Value, "model-provider-failed")));
        Assert.Contains(capture.Measurements, measurement =>
            measurement.Name == "lattice.ai.runtime.request.outcomes" &&
            measurement.Tags.Any(tag => tag.Key == "disposition" && Equals(tag.Value, "failed")));
        var telemetryText = string.Join(
            '\n',
            capture.Activities.SelectMany(activity => new[]
                {
                    activity.DisplayName,
                    activity.StatusDescription
                }.Concat(activity.Tags.Select(tag => tag.Value?.ToString()))
                 .Concat(activity.Events
                     .SelectMany(activityEvent => activityEvent.Tags)
                     .Select(tag => tag.Value?.ToString())))
                .Concat(capture.Measurements.SelectMany(measurement =>
                    measurement.Tags.Select(tag => tag.Value?.ToString()))));
        Assert.DoesNotContain("ERROR_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AzureAuthenticationFailureIsRecordedWithoutProviderMessage()
    {
        using var capture = new TelemetryCapture();
        using var parent = new Activity("test.http.azure-error").SetIdFormat(ActivityIdFormat.W3C).Start();
        var telemetry = new AiRuntimeTelemetry();
        var requestContext = new RuntimeRequestContext(
            "request-telemetry-azure-error",
            parent.TraceId.ToHexString(),
            parent.ParentId,
            null);
        var fixture = new Fixture(
            telemetry,
            modelFailure: new HttpRequestException(
                HttpRequestError.Unknown,
                "Azure OpenAI authentication failed.",
                new global::Azure.Identity.AuthenticationFailedException("AZURE_CREDENTIAL_PRIVATE_MARKER")));

        using (var request = telemetry.StartStage("answer.request", requestContext, "investigation-1"))
        {
            var result = await fixture.Service.AnswerAsync(
                new ImpactAnswerRequest("investigation-1", "What impacts if REQ-123 changes?"),
                Authorization(),
                requestContext,
                CancellationToken.None);
            request.SetDisposition(result.Disposition.ToString());
            telemetry.RecordRequestOutcome(result.Disposition.ToString());
            Assert.Equal(AnswerDisposition.Failed, result.Disposition);
        }

        var modelStage = Assert.Single(capture.Activities, activity =>
            activity.OperationName == "model-generation" &&
            activity.GetTagItem("lattice.request.id") is "request-telemetry-azure-error");
        Assert.Equal(ActivityStatusCode.Error, modelStage.Status);
        Assert.Equal("model-provider-failed", modelStage.GetTagItem("error.type"));
        var telemetryText = string.Join(
            '\n',
            capture.Activities.SelectMany(activity =>
                activity.Tags.Select(tag => tag.Value?.ToString())
                    .Concat(activity.Events.SelectMany(activityEvent =>
                        activityEvent.Tags.Select(tag => tag.Value?.ToString()))))
                .Concat(capture.Measurements.SelectMany(measurement =>
                    measurement.Tags.Select(tag => tag.Value?.ToString()))));
        Assert.DoesNotContain("AZURE_CREDENTIAL_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ApiIngressReusesGeneratedRequestAndActiveW3CTraceIdentifiers()
    {
        using var capture = new TelemetryCapture();
        var previousActivity = Activity.Current;
        Activity.Current = null;
        try
        {
            var authorizationProvider = new StubAuthorizationContextProvider();
            var answerService = new StubImpactAnswerService();
            var controller = new EngineeringImpactController(
                authorizationProvider,
                answerService,
                new AiRuntimeTelemetry())
            {
                ControllerContext = new ControllerContext
                {
                    HttpContext = new DefaultHttpContext()
                }
            };
            controller.HttpContext.TraceIdentifier = "generated-http-request-id";

            var response = await controller.Answer(
                new ImpactAnswerRequestDto
                {
                    InvestigationId = "investigation-1",
                    Question = "What impacts if REQ-123 changes?",
                    ConversationId = "conversation-1"
                },
                CancellationToken.None);

            Assert.IsType<OkObjectResult>(response.Result);
            Assert.NotNull(authorizationProvider.RequestContext);
            Assert.Equal(
                authorizationProvider.RequestContext,
                answerService.RequestContext);
            Assert.Equal("generated-http-request-id", answerService.RequestContext!.RequestId);
            Assert.Matches("^[0-9a-f]{32}$", answerService.RequestContext.TraceId);
            Assert.Contains(
                capture.Activities,
                activity => activity.OperationName == "answer.request" &&
                            Equals(activity.GetTagItem("lattice.request.id"), answerService.RequestContext.RequestId) &&
                            Equals(activity.GetTagItem("lattice.trace.id"), answerService.RequestContext.TraceId) &&
                            activity.TraceId.ToHexString() == answerService.RequestContext.TraceId);
        }
        finally
        {
            Activity.Current = previousActivity;
        }
    }

    private static AuthorizationContext Authorization()
    {
        var scope = new AuthorizationScope(
            "tenant-telemetry-1",
            "subject-telemetry-1",
            "policy-v1",
            "decision-telemetry-1",
            new HashSet<string>(
                ["investigation:resolve-entity", "investigation:read-impact-evidence"],
                StringComparer.Ordinal),
            DateTimeOffset.UtcNow.AddMinutes(1));
        return new AuthorizationContext(
            scope,
            "BEARER_PRIVATE_MARKER SIGNED_TOKEN_PRIVATE_MARKER CLAIM_PRIVATE_MARKER",
            scope.DecisionExpiresAt);
    }

    private const string ValidModelContent =
        """{"schemaVersion":"answer-v1","summary":"ANSWER_PRIVATE_MARKER","impacts":[{"claimId":"relationship:relationship-telemetry-1","explanation":"A validated impact.","evidenceIds":["evidence-telemetry-1"],"sourceIds":["citation-telemetry-1"]}],"warnings":[]}""";

    private sealed class Fixture
    {
        public Fixture(IAiRuntimeTelemetry telemetry, Exception? modelFailure = null)
        {
            Service = new ImpactAnswerService(
                new QuestionInterpreter(),
                new StubEntityResolver(),
                new ScopePlanner(),
                new StubEvidenceSource(),
                new ContextCompiler(),
                new SourceControlledPromptCatalog(),
                new PromptAssembler(),
                new StubModelGateway(modelFailure),
                new AnswerCandidateParser(),
                new AnswerValidator(),
                new ModelConfiguration(
                    "model-config-telemetry-1",
                    "test",
                    "test-model",
                    "test-deployment",
                    256,
                    4096),
                telemetry: telemetry);
        }

        public ImpactAnswerService Service { get; }
    }

    private sealed class StubEntityResolver : IEngineeringEntityResolver
    {
        public Task<EntityResolutionResult> ResolveAsync(
            string investigationId,
            QuestionInterpretation interpretation,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken) =>
            Task.FromResult(new EntityResolutionResult(
                EntityResolutionDisposition.Resolved,
                new ResolvedEntity("plm", "Requirement", "REQ-123", "REQ-123"),
                ["REQ-123"],
                []));
    }

    private sealed class StubEvidenceSource : IEngineeringEvidenceSource
    {
        public Task<EvidenceRetrievalResult> RetrieveImpactAsync(
            ImpactEvidenceQuery query,
            CancellationToken cancellationToken) =>
            Task.FromResult(new EvidenceRetrievalResult(
                query.InvestigationId,
                [
                    new RelationshipEvidence(
                        "relationship-telemetry-1",
                        "REQ-123",
                        "P-1",
                        "depends-on",
                        "EVIDENCE_PRIVATE_MARKER",
                        ["evidence-telemetry-1"])
                ],
                [],
                [],
                [
                    new EvidenceSourceReference(
                        "evidence-telemetry-1",
                        "relationship",
                        "plm",
                        "record-telemetry-1",
                        "revision-1",
                        null,
                        null,
                        "provenance-telemetry-1",
                        query.Authorization.Scope.DecisionId,
                        CitationId: "citation-telemetry-1",
                        Authority: "source-authoritative",
                        Provider: "plm")
                ],
                "source-v1",
                "ontology-v1",
                query.Authorization.Scope.DecisionId,
                query.RequestContext.RequestId,
                query.RequestContext.TraceId));
    }

    private sealed class StubModelGateway(Exception? failure) : IModelGateway
    {
        public Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken)
        {
            if (failure is not null)
            {
                throw failure;
            }

            return Task.FromResult(new ModelResponse(
                request.RequestContext,
                ValidModelContent,
                "test",
                "test-model",
                "model-version-1",
                11,
                7,
                TimeSpan.FromMilliseconds(1)));
        }
    }

    private sealed class StubAuthorizationContextProvider : IAuthorizationContextProvider
    {
        public RuntimeRequestContext? RequestContext { get; private set; }

        public Task<AuthorizationContextResult> CreateAsync(
            System.Security.Claims.ClaimsPrincipal principal,
            string investigationId,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            RequestContext = requestContext;
            return Task.FromResult<AuthorizationContextResult>(
                new AuthorizationContextResult.Authorized(Authorization()));
        }
    }

    private sealed class StubImpactAnswerService : IImpactAnswerService
    {
        public RuntimeRequestContext? RequestContext { get; private set; }

        public Task<ImpactAnswerResult> AnswerAsync(
            ImpactAnswerRequest request,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            RequestContext = requestContext;
            return Task.FromResult(new ImpactAnswerResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Answer,
                "Validated.",
                [],
                [],
                [],
                null));
        }
    }

    private sealed class TelemetryCapture : IDisposable
    {
        private readonly ActivityListener _activityListener;
        private readonly MeterListener _meterListener;

        public TelemetryCapture()
        {
            _activityListener = new ActivityListener
            {
                ShouldListenTo = source => source.Name == AiRuntimeTelemetry.ActivitySourceName,
                Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
                ActivityStopped = activity => Activities.Add(activity)
            };
            ActivitySource.AddActivityListener(_activityListener);

            _meterListener = new MeterListener
            {
                InstrumentPublished = (instrument, listener) =>
                {
                    if (instrument.Meter.Name == AiRuntimeTelemetry.MeterName)
                    {
                        listener.EnableMeasurementEvents(instrument);
                    }
                }
            };
            _meterListener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
                Measurements.Add(new MeasurementRecord(
                    instrument.Name,
                    value,
                    tags.ToArray())));
            _meterListener.SetMeasurementEventCallback<double>((instrument, value, tags, _) =>
                Measurements.Add(new MeasurementRecord(
                    instrument.Name,
                    value,
                    tags.ToArray())));
            _meterListener.Start();
        }

        public ConcurrentBag<Activity> Activities { get; } = [];
        public ConcurrentBag<MeasurementRecord> Measurements { get; } = [];

        public void Dispose()
        {
            _activityListener.Dispose();
            _meterListener.Dispose();
        }
    }

    private sealed record MeasurementRecord(
        string Name,
        object Value,
        KeyValuePair<string, object?>[] Tags);
}
