using System.Text.Json;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
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

namespace Lattice.AI.Runtime.Application;

public sealed class ImpactAnswerService(
    IQuestionInterpreter questionInterpreter,
    IEngineeringEntityResolver entityResolver,
    IScopePlanner scopePlanner,
    IEngineeringEvidenceSource evidenceSource,
    IContextCompiler contextCompiler,
    IPromptCatalog promptCatalog,
    IPromptAssembler promptAssembler,
    IModelGateway modelGateway,
    IAnswerCandidateParser answerCandidateParser,
    IAnswerValidator answerValidator,
    ModelConfiguration modelConfiguration,
    TimeProvider? timeProvider = null,
    IAiRuntimeTelemetry? telemetry = null) : IImpactAnswerService
{
    private const string ResolveEntityGrant = "investigation:resolve-entity";
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";
    private const string PromptId = "engineering-impact";
    private const string PromptVersion = "v1";
    private const int MaxClaims = 25;
    private const int MaxEvidenceItems = 50;
    private const string EstimatedContextTokenBudgetOmissionReason =
        "Claim omitted because the estimated context-token budget would be exceeded.";
    private static readonly HashSet<string> UnsupportedAssertionIssueCodes =
    [
        "unknown-claim",
        "unknown-evidence",
        "unknown-source",
        "unsupported-identifier",
        "unsupported-warning",
        "unauthorized-evidence",
        "unauthorized-source",
        "duplicate-answer-claim",
        "missing-provenance-reference",
        "invalid-source-id"
    ];
    private IAiRuntimeTelemetry Telemetry { get; } = telemetry ?? NullAiRuntimeTelemetry.Instance;

    public async Task<ImpactAnswerResult> AnswerAsync(
        ImpactAnswerRequest request,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(requestContext);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.InvestigationId);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Question);

        cancellationToken.ThrowIfCancellationRequested();
        if (!HasRequiredAuthorization(authorization))
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Deny,
                issues: [new ValidationIssue("authorization-unavailable", "The current authorization does not permit impact answering.")]);
        }

        if (modelConfiguration.MaxInputTokens <= 0 ||
            modelConfiguration.MaxOutputTokens <= 0 ||
            modelConfiguration.MaxOutputTokens >= modelConfiguration.MaxInputTokens)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue(
                    "model-input-budget-not-configured",
                    "The answer model input budget is not configured.")]);
        }

        var interpretation = questionInterpreter.Interpret(request, requestContext);
        if (interpretation.Type != ImpactQuestionType.EngineeringImpact ||
            interpretation.ClarificationReasons.Count > 0)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Clarify,
                issues: ToIssues("question-clarification-required", interpretation.ClarificationReasons));
        }

        PromptBundle prompt;
        int contextTokenAllowance;
        using (var promptStage = Telemetry.StartStage(
            "prompt",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                prompt = promptCatalog.GetRequired(PromptId, PromptVersion);
                var fixedPromptTokens = promptAssembler.EstimateFixedPromptTokens(request, prompt);
                contextTokenAllowance = ModelInputTokenBudget.CalculateContextAllowance(
                    modelConfiguration.MaxInputTokens,
                    modelConfiguration.MaxOutputTokens,
                    fixedPromptTokens);
                promptStage.SetDisposition("ready");
                promptStage.SetTag("prompt.id", prompt.Id);
                promptStage.SetTag("prompt.version", prompt.Version);
                promptStage.SetTag("model.configuration_id", modelConfiguration.Id);
            }
            catch (Exception exception) when (
                exception is KeyNotFoundException or InvalidDataException or ArgumentException or
                    JsonException or IOException or InvalidOperationException)
            {
                promptStage.SetFailure("prompt-unavailable");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    issues: [new ValidationIssue("prompt-unavailable", "The approved answer prompt is unavailable.")]);
            }

            if (contextTokenAllowance == 0)
            {
                Telemetry.RecordContextQuality(0, budgetExhausted: true);
                promptStage.SetFailure("model-input-budget-exceeded");
                promptStage.SetDisposition("abstained");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Abstain,
                    issues: [new ValidationIssue(
                        "model-input-budget-exceeded",
                        "The configured model input budget cannot fit the fixed prompt and output reservation.")]);
            }
        }

        EntityResolutionResult resolution;
        using (var resolutionStage = Telemetry.StartStage(
            "entity-resolution",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                resolution = await entityResolver.ResolveAsync(
                    request.InvestigationId,
                    interpretation,
                    authorization,
                    requestContext,
                    cancellationToken).ConfigureAwait(false);
                resolutionStage.SetDisposition(resolution.Disposition.ToString());
                if (resolution.Entity is not null)
                {
                    resolutionStage.SetTag("entity.id", resolution.Entity.CanonicalId);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                resolutionStage.SetFailure("other");
                resolutionStage.SetDisposition("cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                resolutionStage.SetFailure("entity-resolution-timeout");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    issues: [new ValidationIssue("entity-resolution-timeout", "Engineering subject resolution timed out.")]);
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException)
            {
                resolutionStage.SetFailure("entity-resolution-failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    issues: [new ValidationIssue("entity-resolution-failed", "The engineering subject could not be resolved.")]);
            }
        }

        if (resolution.Disposition == EntityResolutionDisposition.Denied)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Deny,
                issues: ToIssues("entity-resolution-denied", resolution.Diagnostics));
        }

        if (resolution.Disposition is EntityResolutionDisposition.Ambiguous or EntityResolutionDisposition.Unresolved ||
            resolution.Entity is null)
        {
            var reasons = resolution.Diagnostics.Count > 0
                ? resolution.Diagnostics
                : interpretation.ClarificationReasons;
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Clarify,
                issues: ToIssues("subject-clarification-required", reasons));
        }

        ScopePlanningResult plannedScope;
        using (var scopeStage = Telemetry.StartStage(
            "scope-planning",
            requestContext,
            request.InvestigationId))
        {
            plannedScope = scopePlanner.Plan(
                interpretation,
                resolution.Entity,
                authorization.Scope,
                requestContext);
            scopeStage.SetDisposition(plannedScope.Disposition.ToString());
        }
        if (plannedScope.Disposition != ScopePlanningDisposition.Ready || plannedScope.Scope is null)
        {
            var disposition = plannedScope.Disposition switch
            {
                ScopePlanningDisposition.Clarify => AnswerDisposition.Clarify,
                ScopePlanningDisposition.Denied => AnswerDisposition.Deny,
                _ => AnswerDisposition.Failed
            };
            return CreateResult(
                request.InvestigationId,
                requestContext,
                disposition,
                issues: ToIssues("scope-planning-failed", plannedScope.Diagnostics));
        }

        EvidenceRetrievalResult evidence;
        using (var retrievalStage = Telemetry.StartStage(
            "plm-retrieval",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                evidence = await evidenceSource.RetrieveImpactAsync(
                    new ImpactEvidenceQuery(
                        request.InvestigationId,
                        resolution.Entity,
                        plannedScope.Scope,
                        authorization,
                        requestContext),
                    cancellationToken).ConfigureAwait(false);
                retrievalStage.SetDisposition("completed");
                retrievalStage.SetTag("evidence.relationship_count", evidence.Relationships.Count);
                retrievalStage.SetTag("evidence.path_count", evidence.Paths.Count);
                retrievalStage.SetTag("evidence.chain_count", evidence.Chains.Count);
                retrievalStage.SetTag("evidence.source_count", evidence.Sources.Count);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                retrievalStage.SetFailure("other");
                retrievalStage.SetDisposition("cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                retrievalStage.SetFailure("plm-retrieval-timeout");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    issues: [new ValidationIssue("evidence-retrieval-timeout", "PLM evidence retrieval timed out.")]);
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException)
            {
                retrievalStage.SetFailure("plm-retrieval-failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    issues: [new ValidationIssue("evidence-retrieval-failed", "PLM evidence could not be retrieved.")]);
            }
        }

        ContextCompilationResult compilation;
        using (var compilationStage = Telemetry.StartStage(
            "context-compilation",
            requestContext,
            request.InvestigationId))
        {
            compilation = contextCompiler.Compile(
                new ContextCompilationInput(
                    requestContext,
                    request.InvestigationId,
                    resolution.Entity,
                    plannedScope.Scope,
                    authorization.Scope,
                    evidence,
                    new ContextBudget(MaxClaims, MaxEvidenceItems, contextTokenAllowance)));
            var omissions = compilation.Package?.Omissions ?? Array.Empty<ContextOmission>();
            Telemetry.RecordContextQuality(
                omissions.Count,
                omissions.Any(omission => string.Equals(
                    omission.Reason,
                    EstimatedContextTokenBudgetOmissionReason,
                    StringComparison.Ordinal)));
            compilationStage.SetDisposition(compilation.Disposition.ToString());
            if (compilation.Package is not null)
            {
                compilationStage.SetTag("context.compiler.version", compilation.Package.CompilerVersion);
                compilationStage.SetTag("context.package.id", compilation.Package.PackageId);
                compilationStage.SetTag("context.claim_count", compilation.Package.Claims.Count);
                compilationStage.SetTag("context.source_count", compilation.Package.Sources.Count);
            }
            if (compilation.Disposition == CompilationDisposition.Denied)
            {
                compilationStage.SetFailure("context-compilation-denied");
                compilationStage.SetDisposition("denied");
            }
        }
        if (compilation.Disposition == CompilationDisposition.Denied)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Deny,
                issues: ToIssues("context-authorization-failed", compilation.Diagnostics));
        }

        var context = compilation.Package;
        if (context is null)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue("context-compilation-failed", "The Context Package could not be compiled.")]);
        }

        if (compilation.Disposition is CompilationDisposition.Empty or CompilationDisposition.InsufficientEvidence)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Abstain,
                context.PackageId,
                ToIssues(
                    compilation.Disposition == CompilationDisposition.Empty
                        ? "no-impact-evidence"
                        : "insufficient-impact-evidence",
                    compilation.Diagnostics));
        }

        ModelRequest modelRequest;
        using (var promptStage = Telemetry.StartStage(
            "prompt-assembly",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                modelRequest = promptAssembler.Assemble(request, context, prompt, modelConfiguration);
                promptStage.SetDisposition("ready");
                promptStage.SetTag("prompt.id", prompt.Id);
                promptStage.SetTag("prompt.version", prompt.Version);
                promptStage.SetTag("model.configuration_id", modelConfiguration.Id);
            }
            catch (Exception exception) when (
                exception is KeyNotFoundException or InvalidDataException or ArgumentException or
                    JsonException or IOException or InvalidOperationException)
            {
                promptStage.SetFailure("prompt-unavailable");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    context.PackageId,
                    [new ValidationIssue("prompt-unavailable", "The approved answer prompt is unavailable.")]);
            }

            if (!ModelInputTokenBudget.Fits(
                    modelRequest.EstimatedInputTokens,
                    modelConfiguration.MaxInputTokens,
                    modelConfiguration.MaxOutputTokens))
            {
                Telemetry.RecordContextQuality(0, budgetExhausted: true);
                promptStage.SetFailure("model-input-budget-exceeded");
                promptStage.SetDisposition("abstained");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Abstain,
                    context.PackageId,
                    [new ValidationIssue(
                        "model-input-budget-exceeded",
                        "The answer prompt exceeds the configured model input budget.")]);
            }
        }

        ModelResponse modelResponse;
        using (var modelStage = Telemetry.StartStage(
            "model-generation",
            requestContext,
            request.InvestigationId))
        {
            modelStage.SetTag("prompt.id", prompt.Id);
            modelStage.SetTag("prompt.version", prompt.Version);
            modelStage.SetTag("model.configuration_id", modelConfiguration.Id);
            try
            {
                modelResponse = await modelGateway.GenerateAsync(modelRequest, cancellationToken).ConfigureAwait(false);
                modelStage.SetDisposition("completed");
                modelStage.SetTag("model.provider", modelConfiguration.Provider);
                if (modelResponse.ModelVersion is not null)
                {
                    modelStage.SetTag("model.version", modelResponse.ModelVersion);
                }
                if (modelResponse.InputTokens is not null)
                {
                    modelStage.SetTag("model.input_tokens", modelResponse.InputTokens.Value);
                }
                if (modelResponse.OutputTokens is not null)
                {
                    modelStage.SetTag("model.output_tokens", modelResponse.OutputTokens.Value);
                }
                Telemetry.RecordModelUsage(
                    modelConfiguration.Provider,
                    modelConfiguration.Id,
                    modelResponse.InputTokens,
                    modelResponse.OutputTokens);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                modelStage.SetFailure("other");
                modelStage.SetDisposition("cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                modelStage.SetFailure("model-provider-timeout");
                modelStage.SetDisposition("failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    context.PackageId,
                    [new ValidationIssue("model-provider-timeout", "The answer model request timed out.")]);
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException)
            {
                modelStage.SetFailure("model-provider-failed");
                modelStage.SetDisposition("failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    context.PackageId,
                    [new ValidationIssue("model-provider-failed", "The answer model could not complete the request.")]);
            }

            if (!SameRequestContext(modelResponse.RequestContext, requestContext))
            {
                modelStage.SetFailure("correlation-mismatch");
                modelStage.SetDisposition("failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    context.PackageId,
                    [new ValidationIssue("model-response-correlation-mismatch", "The model response belongs to another request.")]);
            }
        }

        AnswerCandidate candidate;
        ValidationResult validation;
        using (var validationStage = Telemetry.StartStage(
            "validation",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                candidate = answerCandidateParser.Parse(modelResponse.Content);
            }
            catch (JsonException)
            {
                validationStage.SetFailure("invalid-model-output");
                validationStage.SetDisposition("failed");
                Telemetry.RecordValidationDisposition("failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    context.PackageId,
                    [new ValidationIssue("invalid-model-output", "The model response did not match the required answer schema.")]);
            }

            validation = answerValidator.Validate(
                candidate,
                context,
                authorization.Scope,
                requestContext,
                request.InvestigationId);
            validationStage.SetDisposition(validation.Disposition.ToString());
            validationStage.SetTag("validation.issue_count", validation.Issues.Count);
            Telemetry.RecordValidationDisposition(validation.Disposition.ToString());
            Telemetry.RecordAnswerQuality(CreateAnswerQualitySummary(candidate, context, validation));
        }

        return validation.Disposition switch
        {
            ValidationDisposition.Accept => CreateAcceptedResult(
                request.InvestigationId,
                requestContext,
                context,
                candidate,
                validation.Issues),
            ValidationDisposition.Clarify => CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Clarify,
                context.PackageId,
                validation.Issues),
            ValidationDisposition.Abstain => CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Abstain,
                context.PackageId,
                validation.Issues),
            _ => CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                validation.Issues)
        };
    }

    private bool HasRequiredAuthorization(AuthorizationContext authorization)
    {
        var scope = authorization.Scope;
        return authorization.ExpiresAt > (timeProvider ?? TimeProvider.System).GetUtcNow() &&
               scope.DecisionExpiresAt > (timeProvider ?? TimeProvider.System).GetUtcNow() &&
               scope.Grants.Contains(ResolveEntityGrant) &&
               scope.Grants.Contains(ReadImpactEvidenceGrant);
    }

    private static ImpactAnswerResult CreateAcceptedResult(
        string investigationId,
        RuntimeRequestContext requestContext,
        ContextPackage context,
        AnswerCandidate candidate,
        IReadOnlyList<ValidationIssue> issues)
    {
        var referencedEvidenceIds = candidate.Impacts
            .SelectMany(impact => impact.EvidenceIds)
            .ToHashSet(StringComparer.Ordinal);
        var referencedSourceIds = candidate.Impacts
            .SelectMany(impact => impact.SourceIds)
            .ToHashSet(StringComparer.Ordinal);
        var sources = context.Sources
            .Where(source => referencedEvidenceIds.Contains(source.EvidenceId) &&
                             GetSourceIds(source).Any(referencedSourceIds.Contains))
            .Distinct()
            .ToArray();

        return new ImpactAnswerResult(
            investigationId,
            requestContext,
            AnswerDisposition.Answer,
            candidate.Summary,
            candidate.Impacts,
            sources,
            issues,
            context.PackageId);
    }

    private static AnswerQualitySummary CreateAnswerQualitySummary(
        AnswerCandidate candidate,
        ContextPackage context,
        ValidationResult validation)
    {
        var citedSourceIdsByEvidence = candidate.Impacts
            .SelectMany(impact => impact.EvidenceIds
                .Distinct(StringComparer.Ordinal)
                .Select(evidenceId => (EvidenceId: evidenceId, SourceIds: impact.SourceIds)))
            .GroupBy(citation => citation.EvidenceId, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.Select(citation => citation.SourceIds).ToArray(),
                StringComparer.Ordinal);

        double? citationCoverage = candidate.Impacts.Count == 0 ? null : 0;
        if (citedSourceIdsByEvidence.Count > 0)
        {
            var matchingCitations = citedSourceIdsByEvidence.Count(citation =>
                context.Sources
                    .Where(source => string.Equals(
                        source.EvidenceId,
                        citation.Key,
                        StringComparison.Ordinal))
                    .Any(source => citation.Value.Any(sourceIds =>
                        GetSourceIds(source).Any(sourceIds.Contains))));
            citationCoverage = Math.Clamp(
                matchingCitations / (double)citedSourceIdsByEvidence.Count,
                0,
                1);
        }

        var referencedClaimIds = candidate.Impacts
            .Select(impact => impact.ClaimId)
            .ToHashSet(StringComparer.Ordinal);
        var confidenceValues = context.Claims
            .Where(claim => referencedClaimIds.Contains(claim.ClaimId))
            .DistinctBy(claim => claim.ClaimId, StringComparer.Ordinal)
            .Where(claim => claim.Confidence is { } confidence && double.IsFinite(confidence))
            .Select(claim => claim.Confidence!.Value)
            .ToArray();

        return new AnswerQualitySummary(
            validation.Disposition == ValidationDisposition.Accept,
            validation.Issues
                .Where(issue => UnsupportedAssertionIssueCodes.Contains(issue.Code))
                .Select(issue => issue.ClaimId ?? issue.Code)
                .Distinct(StringComparer.Ordinal)
                .Count(),
            citationCoverage,
            confidenceValues);
    }

    private static IEnumerable<string> GetSourceIds(EvidenceSourceReference source)
    {
        if (!string.IsNullOrWhiteSpace(source.CitationId))
        {
            yield return source.CitationId;
        }
        if (!string.IsNullOrWhiteSpace(source.ProvenanceId))
        {
            yield return source.ProvenanceId;
        }
        if (!string.IsNullOrWhiteSpace(source.RecordId))
        {
            yield return source.RecordId;
        }
        if (!string.IsNullOrWhiteSpace(source.EvidenceId))
        {
            yield return source.EvidenceId;
        }
    }

    private static ImpactAnswerResult CreateResult(
        string investigationId,
        RuntimeRequestContext requestContext,
        AnswerDisposition disposition,
        string? contextPackageId = null,
        IReadOnlyList<ValidationIssue>? issues = null) =>
        new(
            investigationId,
            requestContext,
            disposition,
            null,
            Array.Empty<AnswerImpact>(),
            Array.Empty<EvidenceSourceReference>(),
            issues ?? Array.Empty<ValidationIssue>(),
            contextPackageId);

    private static IReadOnlyList<ValidationIssue> ToIssues(string code, IReadOnlyList<string> diagnostics) =>
        diagnostics.Count > 0
            ? diagnostics.Select(diagnostic => new ValidationIssue(code, diagnostic)).ToArray()
            : [new ValidationIssue(code, "The request could not be completed safely.")];

    private static bool SameRequestContext(RuntimeRequestContext left, RuntimeRequestContext right) =>
        string.Equals(left.RequestId, right.RequestId, StringComparison.Ordinal) &&
        string.Equals(left.TraceId, right.TraceId, StringComparison.Ordinal) &&
        string.Equals(left.ParentRequestId, right.ParentRequestId, StringComparison.Ordinal) &&
        string.Equals(left.ConversationId, right.ConversationId, StringComparison.Ordinal);
}
