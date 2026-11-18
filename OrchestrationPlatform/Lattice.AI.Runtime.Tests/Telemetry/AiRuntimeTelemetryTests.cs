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
                    "What impacts if REQ-123 changes? QUESTION_PRIVATE_MARKER PROMPT_PRIVATE_MARKER " +
                    "https://plm.example/investigations/INVESTIGATION_PRIVATE_MARKER?deepLink=DEEP_LINK_PRIVATE_MARKER",
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
            "prompt-assembly",
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
        Assert.Null(compilationStage.GetTagItem("context.package.id"));
        Assert.Null(Assert.Single(stages, stage => stage.OperationName == "entity-resolution").GetTagItem("entity.id"));
        var excludedIdentifierTags = new[]
        {
            "lattice.investigation.id",
            "entity.id",
            "tenant.id",
            "subject.id",
            "authorization.decision.id",
            "context.package.id"
        };
        Assert.DoesNotContain(
            stages.SelectMany(stage => stage.Tags),
            tag => excludedIdentifierTags.Contains(tag.Key, StringComparer.Ordinal));
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
        Assert.All(stages, stage => Assert.Empty(stage.Events));

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
        Assert.DoesNotContain("investigation-1", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("REQ-123", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("tenant-telemetry-1", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("subject-telemetry-1", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("decision-telemetry-1", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("INVESTIGATION_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain(
            stages.SelectMany(stage => stage.Tags).Select(tag => tag.Value?.ToString()),
            value => value?.StartsWith("context-", StringComparison.Ordinal) == true);
        Assert.DoesNotContain("QUESTION_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("PROMPT_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("ANSWER_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("EVIDENCE_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("BEARER_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("SIGNED_TOKEN_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("CLAIM_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);
        Assert.DoesNotContain("DEEP_LINK_PRIVATE_MARKER", telemetryText, StringComparison.Ordinal);

        var metricDimensions = capture.Measurements.SelectMany(measurement => measurement.Tags).ToArray();
        Assert.DoesNotContain(
            metricDimensions,
            tag => excludedIdentifierTags.Contains(tag.Key, StringComparer.Ordinal));
        Assert.DoesNotContain(
            metricDimensions,
            tag => new[]
            {
                "investigation-1",
                "REQ-123",
                "tenant-telemetry-1",
                "subject-telemetry-1",
                "decision-telemetry-1",
                requestContext.RequestId,
                requestContext.TraceId
            }.Contains(tag.Value?.ToString(), StringComparer.Ordinal));
    }

    [Theory]
    [InlineData("investigation")]
    [InlineData("entity")]
    [InlineData("tenant")]
    [InlineData("context-package")]
    public void ExplicitOptInIncludesOnlyConfiguredIdentifier(string identifier)
    {
        using var capture = new TelemetryCapture();
        var options = new AiRuntimeTelemetryOptions();
        var expectedTag = identifier switch
        {
            "investigation" => "lattice.investigation.id",
            "entity" => "entity.id",
            "tenant" => "tenant.id",
            "context-package" => "context.package.id",
            _ => throw new ArgumentOutOfRangeException(nameof(identifier))
        };
        switch (identifier)
        {
            case "investigation":
                options.IncludeInvestigationIdentifier = true;
                break;
            case "entity":
                options.IncludeEntityIdentifier = true;
                break;
            case "tenant":
                options.IncludeTenantIdentifier = true;
                break;
            case "context-package":
                options.IncludeContextPackageIdentifier = true;
                break;
        }

        var telemetry = new AiRuntimeTelemetry(Microsoft.Extensions.Options.Options.Create(options));
        var requestContext = new RuntimeRequestContext("request-opt-in", new string('a', 32), null, null);
        using (var stage = telemetry.StartStage(
                   "answer.request",
                   requestContext,
                   "INVESTIGATION_IDENTIFIER"))
        {
            stage.SetTag("entity.id", "ENTITY_IDENTIFIER");
            stage.SetTag("tenant.id", "TENANT_IDENTIFIER");
            stage.SetTag("context.package.id", "CONTEXT_PACKAGE_IDENTIFIER");
            stage.SetTag("subject.id", "SUBJECT_IDENTIFIER");
            stage.SetTag("authorization.decision.id", "DECISION_IDENTIFIER");
        }

        var activity = Assert.Single(capture.Activities);
        var expectedValue = identifier switch
        {
            "investigation" => "INVESTIGATION_IDENTIFIER",
            "entity" => "ENTITY_IDENTIFIER",
            "tenant" => "TENANT_IDENTIFIER",
            "context-package" => "CONTEXT_PACKAGE_IDENTIFIER",
            _ => throw new ArgumentOutOfRangeException(nameof(identifier))
        };
        Assert.Equal(expectedValue, activity.GetTagItem(expectedTag));
        foreach (var tagName in new[]
                 {
                     "lattice.investigation.id",
                     "entity.id",
                     "tenant.id",
                     "context.package.id"
                 }.Where(tagName => tagName != expectedTag))
        {
            Assert.Null(activity.GetTagItem(tagName));
        }
        Assert.Null(activity.GetTagItem("subject.id"));
        Assert.Null(activity.GetTagItem("authorization.decision.id"));
    }

    [Fact]
    public void PrivacyProcessorRedactsUrlsAndCredentialHeadersFromActivityAndEvents()
    {
        var activity = new Activity("HTTP GET")
        {
            DisplayName = "GET https://plm.example/api/tenants/TENANT_PRIVATE_MARKER/entities/ENTITY_PRIVATE_MARKER/entity/ENTITY_PRIVATE_MARKER/investigations/INVESTIGATION_PRIVATE_MARKER/evidence?question=QUESTION_PRIVATE_MARKER#fragment"
        };
        activity.Start();
        activity.SetTag(
            "url.full",
            "https://user:URL_PASSWORD_PRIVATE_MARKER@plm.example/api/tenants/TENANT_PRIVATE_MARKER/entities/ENTITY_PRIVATE_MARKER/entity/ENTITY_PRIVATE_MARKER/investigations/INVESTIGATION_PRIVATE_MARKER/evidence?token=TOKEN_PRIVATE_MARKER#fragment");
        activity.SetTag(
            "http.url",
            "https://plm.example/api/tenants/TENANT_PRIVATE_MARKER/entities/ENTITY_PRIVATE_MARKER/entity/ENTITY_PRIVATE_MARKER/investigations/INVESTIGATION_PRIVATE_MARKER/evidence?query=QUERY_PRIVATE_MARKER");
        activity.SetTag(
            "url.path",
            "/api/tenants/TENANT_PRIVATE_MARKER/entities/ENTITY_PRIVATE_MARKER/entity/ENTITY_PRIVATE_MARKER/investigations/INVESTIGATION_PRIVATE_MARKER/evidence?query=PATH_PRIVATE_MARKER#fragment");
        activity.SetTag(
            "http.target",
            "/api/tenants/TENANT_PRIVATE_MARKER/entities/ENTITY_PRIVATE_MARKER/entity/ENTITY_PRIVATE_MARKER/investigations/INVESTIGATION_PRIVATE_MARKER/evidence?query=TARGET_PRIVATE_MARKER");
        activity.SetTag("url.query", "query=URL_QUERY_PRIVATE_MARKER");
        activity.SetTag("http.request.header.authorization", "Bearer BEARER_PRIVATE_MARKER");
        activity.SetTag("http.request.header.x-lattice-authorization-decision", "DECISION_PRIVATE_MARKER");
        activity.SetTag("http.request.header.x-service-ticket", "TICKET_PRIVATE_MARKER");
        activity.SetTag("http.request.header.x-access-token", "TOKEN_PRIVATE_MARKER");
        activity.SetTag("http.request.header.cookie", "COOKIE_PRIVATE_MARKER");
        activity.SetTag("http.request.header.x-api-key", "API_KEY_PRIVATE_MARKER");
        activity.SetTag("http.request.header.accept", "application/json");
        activity.SetTag("safe.route", "engineering-impact");
        activity.SetTag("lattice.investigation.id", "INVESTIGATION_PRIVATE_MARKER");
        activity.SetTag("entity.id", "ENTITY_PRIVATE_MARKER");
        activity.SetTag("tenant.id", "TENANT_PRIVATE_MARKER");
        activity.SetTag("context.package.id", "CONTEXT_PACKAGE_PRIVATE_MARKER");
        activity.SetTag("subject.id", "SUBJECT_PRIVATE_MARKER");
        activity.SetTag("authorization.decision.id", "DECISION_PRIVATE_MARKER");
        activity.Stop();
        var processor = new AiRuntimeTelemetryPrivacyProcessor(new AiRuntimeTelemetryOptions());
        processor.OnEnd(activity);

        Assert.Equal(
            "GET https://plm.example/api/tenants/%7Bidentifier%7D/entities/%7Bidentifier%7D/entity/%7Bidentifier%7D/investigations/%7Bidentifier%7D/evidence",
            activity.DisplayName);
        Assert.Equal(
            "https://plm.example/api/tenants/%7Bidentifier%7D/entities/%7Bidentifier%7D/entity/%7Bidentifier%7D/investigations/%7Bidentifier%7D/evidence",
            activity.GetTagItem("url.full"));
        Assert.Equal(
            "https://plm.example/api/tenants/%7Bidentifier%7D/entities/%7Bidentifier%7D/entity/%7Bidentifier%7D/investigations/%7Bidentifier%7D/evidence",
            activity.GetTagItem("http.url"));
        Assert.Equal(
            "/api/tenants/{identifier}/entities/{identifier}/entity/{identifier}/investigations/{identifier}/evidence",
            activity.GetTagItem("url.path"));
        Assert.Equal(
            "/api/tenants/{identifier}/entities/{identifier}/entity/{identifier}/investigations/{identifier}/evidence",
            activity.GetTagItem("http.target"));
        Assert.Null(activity.GetTagItem("url.query"));
        Assert.Null(activity.GetTagItem("http.request.header.authorization"));
        Assert.Null(activity.GetTagItem("http.request.header.x-lattice-authorization-decision"));
        Assert.Null(activity.GetTagItem("http.request.header.x-service-ticket"));
        Assert.Null(activity.GetTagItem("http.request.header.x-access-token"));
        Assert.Null(activity.GetTagItem("http.request.header.cookie"));
        Assert.Null(activity.GetTagItem("http.request.header.x-api-key"));
        Assert.DoesNotContain(activity.TagObjects, tag => tag.Key == "http.request.header.authorization");
        Assert.DoesNotContain(activity.TagObjects, tag => tag.Key == "http.request.header.x-lattice-authorization-decision");
        Assert.DoesNotContain(activity.TagObjects, tag => tag.Key == "http.request.header.x-service-ticket");
        Assert.DoesNotContain(activity.TagObjects, tag => tag.Key == "http.request.header.x-access-token");
        Assert.DoesNotContain(activity.TagObjects, tag => tag.Key == "http.request.header.cookie");
        Assert.DoesNotContain(activity.TagObjects, tag => tag.Key == "http.request.header.x-api-key");
        Assert.Equal("application/json", activity.GetTagItem("http.request.header.accept"));
        Assert.Equal("engineering-impact", activity.GetTagItem("safe.route"));
        Assert.Null(activity.GetTagItem("lattice.investigation.id"));
        Assert.Null(activity.GetTagItem("entity.id"));
        Assert.Null(activity.GetTagItem("tenant.id"));
        Assert.Null(activity.GetTagItem("context.package.id"));
        Assert.Null(activity.GetTagItem("subject.id"));
        Assert.Null(activity.GetTagItem("authorization.decision.id"));
        Assert.Empty(activity.Events);
        var exportedText = string.Join(
            '\n',
            new[] { activity.DisplayName }
                .Concat(activity.Tags.Select(tag => tag.Value?.ToString())));
        Assert.DoesNotContain("PRIVATE_MARKER", exportedText, StringComparison.Ordinal);
        Assert.DoesNotContain("URL_PASSWORD_PRIVATE_MARKER", exportedText, StringComparison.Ordinal);
        Assert.Equal("HTTP GET", activity.OperationName);

        var urlDisplayNameActivity = new Activity("HTTP GET")
        {
            DisplayName = "GET https://plm.example/api/health?query=DISPLAY_QUERY_PRIVATE_MARKER#fragment"
        };
        urlDisplayNameActivity.Start();
        urlDisplayNameActivity.Stop();
        processor.OnEnd(urlDisplayNameActivity);
        Assert.Equal("GET https://plm.example/api/health", urlDisplayNameActivity.DisplayName);
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
    public void PascalCaseDispositionsAndBudgetFailureCategoriesRemainSpecific()
    {
        using var capture = new TelemetryCapture();
        var telemetry = new AiRuntimeTelemetry();
        var requestContext = new RuntimeRequestContext("request-normalization", new string('b', 32), null, null);

        using (var stage = telemetry.StartStage("context-compilation", requestContext))
        {
            stage.SetDisposition("InsufficientEvidence");
        }

        using (var stage = telemetry.StartStage("prompt-assembly", requestContext))
        {
            stage.SetFailure("model-input-budget-exceeded");
        }

        var compilation = Assert.Single(capture.Activities, activity =>
            activity.OperationName == "context-compilation");
        Assert.Equal("insufficient-evidence", compilation.GetTagItem("lattice.stage.disposition"));

        var prompt = Assert.Single(capture.Activities, activity =>
            activity.OperationName == "prompt-assembly");
        Assert.Equal("model-input-budget-exceeded", prompt.GetTagItem("error.type"));
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
