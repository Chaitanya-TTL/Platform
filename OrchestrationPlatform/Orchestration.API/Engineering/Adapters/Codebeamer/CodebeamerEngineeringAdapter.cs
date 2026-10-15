using Orchestration.API.Engineering.Contracts;

namespace Orchestration.API.Engineering.Adapters.Codebeamer;

public sealed class CodebeamerEngineeringAdapter : IEngineeringSourceAdapter
{
    private readonly ICodebeamerCliClient client;
    public CodebeamerEngineeringAdapter(ICodebeamerCliClient client) => this.client = client;
    public EngineeringSource Source => EngineeringSource.Codebeamer;

    public async Task<SourceCapability> GetCapabilitiesAsync(CancellationToken token)
    {
        var status = await client.StatusAsync(token);
        return Capability(status.Status == "complete" ? SourceReadiness.Ready : SourceReadiness.Degraded);
    }

    public async Task<SourceDiscoveryOutcome> DiscoverAsync(EngineeringDiscoveryRequest request, QueryNormalizationRecord normalized, CancellationToken token)
    {
        SourceCapability capability;
        try { capability = await GetCapabilitiesAsync(token); }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) { return DiscoveryFailure("CODEBEAMER_STATUS_FAILED", ex.Message); }

        var query = !string.IsNullOrWhiteSpace(request.Query.ProductName) ? request.Query.ProductName : normalized.NormalizedValue;
        if (string.IsNullOrWhiteSpace(query)) return new(Source, StandardStatus.Empty, capability, [], [], [], false);
        try
        {
            var response = await client.SearchAsync(query, request.ResultLimitPerSource, token);
            var candidates = response.Matches.Select(x => Candidate(x, response)).ToList();
            return new(Source, candidates.Count == 0 ? StandardStatus.Empty : StandardStatus.Success, capability, candidates, [], [], false);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) { return DiscoveryFailure("CODEBEAMER_DISCOVERY_FAILED", ex.Message, capability); }
    }

    public async Task<StandardExtractionResult> ExtractAsync(string jobId, EngineeringExtractionRequest request, IProgress<StandardProgress> progress, CancellationToken token)
    {
        var started = DateTimeOffset.UtcNow;
        var capability = Capability(SourceReadiness.Ready);
        progress.Report(Progress(jobId, JobState.Resolving, 10, "Resolving the selected Codebeamer requirement from the synchronized catalog."));
        try
        {
            var lookup = ResolveLookup(request.Candidate);
            var response = await client.SearchAsync(lookup, 50, token);
            var match = response.Matches.FirstOrDefault(x =>
                string.Equals(x.CanonicalId, request.Candidate.CandidateId, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(x.ExternalKey, request.Candidate.SourceMetadata.GetValueOrDefault("externalKey"), StringComparison.OrdinalIgnoreCase) ||
                string.Equals(x.ItemId.ToString(), request.Candidate.NativeId, StringComparison.OrdinalIgnoreCase));
            if (match is null) return Failure(jobId, request, started, capability, "CODEBEAMER_REQUIREMENT_NOT_FOUND", "The selected Codebeamer requirement is not present in the verified local catalog.", false, StandardStatus.Empty);

            progress.Report(Progress(jobId, JobState.Enriching, 70, "Mapping Codebeamer requirement and hierarchy evidence."));
            var candidate = Candidate(match, response);
            var evidence = new Dictionary<string, object?>
            {
                ["requirement"] = new Dictionary<string, object?>
                {
                    ["canonicalId"] = match.CanonicalId, ["itemId"] = match.ItemId, ["externalKey"] = match.ExternalKey,
                    ["name"] = match.Name, ["description"] = match.Description, ["status"] = match.Status,
                    ["priority"] = match.Priority, ["categories"] = match.Categories, ["severities"] = match.Severities,
                    ["version"] = match.Version, ["stale"] = match.Stale
                },
                ["sourceContext"] = new Dictionary<string, object?>
                {
                    ["projectId"] = match.ProjectId, ["projectName"] = match.ProjectName,
                    ["trackerId"] = match.TrackerId, ["trackerName"] = match.TrackerName
                },
                ["hierarchy"] = new Dictionary<string, object?>
                {
                    ["parentName"] = match.ParentName, ["childNames"] = match.ChildNames
                },
                ["catalog"] = new Dictionary<string, object?>
                {
                    ["revision"] = response.CatalogRevision, ["status"] = response.CatalogStatus,
                    ["synchronizedAt"] = response.CatalogSynchronizedAt, ["requirementCount"] = response.CatalogRequirementCount
                }
            };
            var completed = DateTimeOffset.UtcNow;
            var finalProgress = Progress(jobId, JobState.Success, 100, "Codebeamer requirement extraction completed from the verified local catalog.");
            progress.Report(finalProgress);
            return new(EngineeringContractVersions.V1, request.RequestId, request.CorrelationId, jobId, Source, StandardStatus.Success,
                new(StandardStatus.Success, candidate, match.CanonicalId, [], []), capability, null, [], evidence, [], [], finalProgress, [],
                new(ProvenanceKind.CachedSourceResult, "codebeamer_extractor", response.CatalogSynchronizedAt, match.CanonicalId),
                [new(EngineeringStage.Resolution, EvidenceAvailability.Available, StandardStatus.Success, "Selected requirement resolved from the synchronized Codebeamer catalog."), new(EngineeringStage.Extraction, EvidenceAvailability.Available, StandardStatus.Success, "Requirement content and hierarchy context mapped to standard evidence.")],
                started, completed, (long)(completed - started).TotalMilliseconds);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) { return Failure(jobId, request, started, capability, "CODEBEAMER_EXTRACTION_FAILED", ex.Message, true); }
    }

    private static string ResolveLookup(SourceCandidate candidate)
    {
        if (candidate.SourceMetadata.TryGetValue("externalKey", out var externalKey) && !string.IsNullOrWhiteSpace(externalKey)) return externalKey;
        if (!string.IsNullOrWhiteSpace(candidate.DisplayName)) return candidate.DisplayName;
        return candidate.NativeId;
    }

    private static SourceCandidate Candidate(CodebeamerMatchDto x, CodebeamerSearchDto response) => new(
        x.CanonicalId, EngineeringSource.Codebeamer, x.ItemId.ToString(), x.Name, "Requirement", null, x.Version?.ToString(), x.Description, x.Status,
        x.Score >= 90 ? MatchCategory.VerifiedIdentifierMatch : x.Score >= 70 ? MatchCategory.ExactNormalizedNameMatch : MatchCategory.SourceSearchResult,
        x.Explanation, x.Score >= 90 ? ConfidenceClass.Verified : x.Score >= 60 ? ConfidenceClass.Deterministic : ConfidenceClass.Probable,
        ["requirements", "hierarchy", "local-search", "selected-requirement-extraction"],
        new Dictionary<string, string?> { ["externalKey"] = x.ExternalKey, ["projectId"] = x.ProjectId.ToString(), ["projectName"] = x.ProjectName, ["trackerId"] = x.TrackerId.ToString(), ["trackerName"] = x.TrackerName, ["classification"] = x.Classification, ["score"] = x.Score.ToString(), ["matchedFields"] = string.Join(",", x.MatchedFields), ["catalogRevision"] = response.CatalogRevision, ["catalogStatus"] = response.CatalogStatus, ["catalogSynchronizedAt"] = response.CatalogSynchronizedAt.ToString("O"), ["stale"] = x.Stale.ToString() },
        new(ProvenanceKind.CachedSourceResult, "codebeamer_extractor", response.CatalogSynchronizedAt, x.CanonicalId), true);

    private static StandardExtractionResult Failure(string id, EngineeringExtractionRequest request, DateTimeOffset started, SourceCapability capability, string code, string message, bool retryable, StandardStatus status = StandardStatus.Failed)
    {
        var now = DateTimeOffset.UtcNow; var error = new StructuredError(code, EngineeringSource.Codebeamer, EngineeringStage.Extraction, message, "The selected Codebeamer requirement could not be extracted.", retryable, now);
        var state = status == StandardStatus.Empty ? JobState.Empty : JobState.Failed;
        return new(EngineeringContractVersions.V1, request.RequestId, request.CorrelationId, id, EngineeringSource.Codebeamer, status, new(status, request.Candidate, null, [], [error]), capability, null, [], new Dictionary<string, object?>(), [], [error], Progress(id, state, 100, message), [], new(ProvenanceKind.Unavailable, "codebeamer_extractor", now), [new(EngineeringStage.Extraction, EvidenceAvailability.Unavailable, status, message)], started, now, (long)(now - started).TotalMilliseconds);
    }

    private SourceDiscoveryOutcome DiscoveryFailure(string code, string message, SourceCapability? capability = null) => new(Source, StandardStatus.Unavailable, capability ?? Capability(SourceReadiness.Unavailable), [], [], [new(code, Source, EngineeringStage.Discovery, message, "Codebeamer requirement discovery is currently unavailable.", true, DateTimeOffset.UtcNow)], true);
    private static StandardProgress Progress(string id, JobState state, int percent, string message) => new(id, EngineeringSource.Codebeamer, EngineeringStage.Extraction, state, percent, message, DateTimeOffset.UtcNow);
    private static SourceCapability Capability(SourceReadiness readiness) => new(EngineeringSource.Codebeamer, readiness, [DiscoveryMode.ExactId, DiscoveryMode.Name, DiscoveryMode.Number], true, true, true, true, true, false, true, false, false, true, true, true, [], ["Discovery and selected-requirement extraction use the synchronized local Codebeamer catalog.", "Live synchronization and relation enrichment are managed separately."]);
}
