using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Azure.Core;
using Lattice.AI.Runtime.ApplicationContext;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.FactEvidence;
using Orchestration.API.AI.Adapters;
using Microsoft.Extensions.Options;

namespace Lattice.AI.Runtime.Tests.SourceEvidence;

public sealed class PlmBrainSourceEvidenceRetrieverTests
{
    [Fact]
    public async Task RetrieveAsync_MapsEveryBoundRecordAndPreservesLineage()
    {
        var client = new FakePlmBrainClient(Response(Records()));
        var retriever = new PlmBrainSourceEvidenceRetriever(client);
        var query = Query();

        var result = await retriever.RetrieveAsync(query, CancellationToken.None);

        Assert.Equal(2, result.Passages.Count);
        Assert.Equal("snapshot-7", result.SourceVersion);
        Assert.Equal("decision-1", result.AuthorizationDecisionId);
        Assert.Equal("request-1", result.RequestId);
        Assert.Equal("trace-1", result.TraceId);
        Assert.Equal("partial", result.Diagnostics?.SnapshotCompleteness);
        Assert.Equal(2, result.Diagnostics?.Projection.ProjectedRecordCount);
        Assert.Empty(client.LastPlan!.LinkedEntityIds);
        Assert.Empty(client.LastPlan.SourceApplications);
        Assert.Empty(client.LastPlan.ExactIdentifiers);

        var passage = Assert.Single(result.Passages, item => item.SourceApplication == "configit");
        Assert.Equal("record-configit", passage.PassageId);
        Assert.Equal("native-configit", passage.SourceRecordId);
        Assert.Equal("configit", passage.SourceApplication);
        Assert.Equal("expression", passage.SourceFieldName);
        Assert.Equal(["citation-configit"], passage.CitationIds);
        Assert.Equal("sha256:provenance-configit", passage.ProvenanceId);
        Assert.Equal("stale", passage.Freshness);
        Assert.Equal("2025-01-02T03:04:05Z", passage.SourceTimestamp);
        Assert.Equal("2025-01-01T00:00:00Z", passage.ValidFrom);
        Assert.Equal("partial", passage.SnapshotCompleteness);
    }

    [Fact]
    public async Task RetrieveAsync_RejectsResponseBoundToAnotherRequest()
    {
        var response = Response(Records()) with { RequestId = "other-request" };
        var retriever = new PlmBrainSourceEvidenceRetriever(new FakePlmBrainClient(response));

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => retriever.RetrieveAsync(Query(), CancellationToken.None));
    }

    [Fact]
    public async Task PlmBrainClient_RetrievesSourceEvidenceThroughProtectedInvestigationRoute()
    {
        var handler = new RecordingHandler(Response(Records()));
        using var httpClient = new HttpClient(handler);
        var client = new PlmBrainClient(
            httpClient,
            new PlmBrainWorkloadTokenProvider(new StaticTokenCredential()),
            Options.Create(new PlmBrainServiceOptions
            {
                BaseAddress = "https://plm-brain.test",
                WorkloadScope = "api://plm-brain/.default"
            }));
        var plan = new SourceEvidencePlan(true, [], [], [], "broad-investigation");

        await client.RetrieveSourceEvidenceAsync(
            "investigation-1",
            plan,
            Authorization(),
            RequestContext(),
            CancellationToken.None);

        Assert.Equal(
            "/api/internal/v1/investigations/investigation-1/source-evidence",
            handler.Request!.RequestUri!.AbsolutePath);
        Assert.Equal("Bearer", handler.Request.Headers.Authorization!.Scheme);
        Assert.Equal("workload-token", handler.Request.Headers.Authorization.Parameter);
        Assert.Equal("signed-decision", handler.Request.Headers.GetValues("X-Lattice-Authorization-Decision").Single());
        Assert.Equal("request-1", handler.Request.Headers.GetValues("X-Lattice-Request-Id").Single());
        var body = handler.Body!.Value;
        Assert.Empty(body.GetProperty("sourceApplications").EnumerateArray());
        Assert.Empty(body.GetProperty("relevantEntityIds").EnumerateArray());
        Assert.Empty(body.GetProperty("exactIdentifiers").EnumerateArray());
    }

    private static SourceEvidenceQuery Query() =>
        new(
            "investigation-1",
            null,
            [],
            [],
            [],
            Authorization(),
            RequestContext());

    private static PlmBrainSourceEvidenceResponse Response(IReadOnlyList<SourceEvidenceRecord> records) =>
        new(
            PlmBrainServiceContract.Version,
            "investigation-1",
            7,
            "snapshot-7",
            "decision-1",
            "request-1",
            "trace-1",
            records,
            new SourceEvidenceProjectionDiagnostics(
                2,
                records.Count,
                new Dictionary<string, int>(),
                new Dictionary<string, int>(),
                new Dictionary<string, int>()))
        {
            SnapshotLifecycle = "partial",
            SnapshotCompleteness = "partial"
        };

    private static IReadOnlyList<SourceEvidenceRecord> Records() =>
    [
        Record("configit", "record-configit", "native-configit", "rule expression"),
        Record("sap", "record-sap", "native-sap", "material description")
    ];

    private static SourceEvidenceRecord Record(
        string source,
        string recordId,
        string sourceRecordId,
        string text) =>
        new(
            "1.0",
            recordId,
            "tenant-1",
            "investigation-1",
            7,
            source,
            sourceRecordId,
            ["entity-1"],
            "engineering-record",
            "Steering record",
            text,
            "entities/entity-1/sourceFieldMetadata/expression",
            "revision-3",
            "2025-01-02T03:04:05Z",
            "2025-01-03T03:04:05Z",
            "stale",
            "partial",
            "partial",
            ["partial"],
            [new SourceEvidenceOperationStatus("extract", "partial", "stale", "2025-01-03T03:04:05Z")],
            "sha256:content",
            [$"evidence-{source}"],
            $"sha256:provenance-{source}",
            "source-authoritative",
            null)
        {
            SourceFieldName = "expression",
            CitationIds = [$"citation-{source}"],
            EffectiveAt = "2024-12-01T00:00:00Z",
            ValidFrom = "2025-01-01T00:00:00Z",
            ValidTo = "2025-12-31T23:59:59Z"
        };

    private static AuthorizationContext Authorization() =>
        new(
            new AuthorizationScope(
                "tenant-1",
                "user-1",
                "policy-v1",
                "decision-1",
                new HashSet<string>(StringComparer.Ordinal),
                DateTimeOffset.UtcNow.AddMinutes(1)),
            "signed-decision",
            DateTimeOffset.UtcNow.AddMinutes(1));

    private static RuntimeRequestContext RequestContext() =>
        new("request-1", "trace-1", null, "conversation-1");

    private sealed class RecordingHandler(PlmBrainSourceEvidenceResponse response) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }

        public JsonElement? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Request = request;
            Body = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken: cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(response)
            };
        }
    }

    private sealed class StaticTokenCredential : TokenCredential
    {
        public override AccessToken GetToken(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken) =>
            new("workload-token", DateTimeOffset.UtcNow.AddMinutes(10));

        public override ValueTask<AccessToken> GetTokenAsync(
            TokenRequestContext requestContext,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(GetToken(requestContext, cancellationToken));
    }

    private sealed class FakePlmBrainClient(PlmBrainSourceEvidenceResponse response) : IPlmBrainClient
    {
        public SourceEvidencePlan? LastPlan { get; private set; }

        public Task<PlmBrainSourceEvidenceResponse> RetrieveSourceEvidenceAsync(
            string investigationId,
            SourceEvidencePlan plan,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken)
        {
            LastPlan = plan;
            return Task.FromResult(response);
        }

        public Task<PlmBrainEntityResolutionResponse> ResolveEntityAsync(
            string investigationId,
            string candidateEntityId,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<PlmBrainImpactEvidenceResponse> RetrieveImpactAsync(
            string investigationId,
            string subjectEntityId,
            ImpactScope scope,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<PlmBrainImpactEvidenceResponse> RetrieveInvestigationAsync(
            string investigationId,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<PlmBrainFactEvidenceResponse> RetrieveFactEvidenceAsync(
            string investigationId,
            FactEvidencePlan plan,
            string sourceVersion,
            string ontologyVersion,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<PlmBrainApplicationContextResponse> RetrieveApplicationContextAsync(
            string investigationId,
            ApplicationContextPlan plan,
            string sourceVersion,
            string ontologyVersion,
            AuthorizationContext authorization,
            RuntimeRequestContext requestContext,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }
}
