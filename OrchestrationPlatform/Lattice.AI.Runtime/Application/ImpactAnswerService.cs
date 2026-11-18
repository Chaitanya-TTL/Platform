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
    TimeProvider? timeProvider = null) : IImpactAnswerService
{
    private const string ResolveEntityGrant = "investigation:resolve-entity";
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";
    private const string PromptId = "engineering-impact";
    private const string PromptVersion = "v1";
    private static readonly ContextBudget Budget = new(25, 50, 12_000);

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

        EntityResolutionResult resolution;
        try
        {
            resolution = await entityResolver.ResolveAsync(
                request.InvestigationId,
                interpretation,
                authorization,
                requestContext,
                cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue("entity-resolution-timeout", "Engineering subject resolution timed out.")]);
        }
        catch (Exception exception) when (exception is HttpRequestException or TimeoutException or InvalidOperationException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue("entity-resolution-failed", "The engineering subject could not be resolved.")]);
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

        var plannedScope = scopePlanner.Plan(
            interpretation,
            resolution.Entity,
            authorization.Scope,
            requestContext);
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
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue("evidence-retrieval-timeout", "PLM evidence retrieval timed out.")]);
        }
        catch (Exception exception) when (exception is HttpRequestException or TimeoutException or InvalidOperationException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue("evidence-retrieval-failed", "PLM evidence could not be retrieved.")]);
        }

        var compilation = contextCompiler.Compile(
            new ContextCompilationInput(
                requestContext,
                request.InvestigationId,
                resolution.Entity,
                plannedScope.Scope,
                authorization.Scope,
                evidence,
                Budget));
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

        PromptBundle prompt;
        try
        {
            prompt = promptCatalog.GetRequired(PromptId, PromptVersion);
        }
        catch (Exception exception) when (exception is KeyNotFoundException or InvalidDataException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                [new ValidationIssue("prompt-unavailable", "The approved answer prompt is unavailable.")]);
        }

        var modelRequest = promptAssembler.Assemble(request, context, prompt, modelConfiguration);
        ModelResponse modelResponse;
        try
        {
            modelResponse = await modelGateway.GenerateAsync(modelRequest, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                [new ValidationIssue("model-provider-timeout", "The answer model request timed out.")]);
        }
        catch (Exception exception) when (exception is HttpRequestException or TimeoutException or InvalidOperationException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                [new ValidationIssue("model-provider-failed", "The answer model could not complete the request.")]);
        }

        if (!SameRequestContext(modelResponse.RequestContext, requestContext))
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                [new ValidationIssue("model-response-correlation-mismatch", "The model response belongs to another request.")]);
        }

        AnswerCandidate candidate;
        try
        {
            candidate = answerCandidateParser.Parse(modelResponse.Content);
        }
        catch (JsonException)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                [new ValidationIssue("invalid-model-output", "The model response did not match the required answer schema.")]);
        }

        var validation = answerValidator.Validate(candidate, context, authorization.Scope, requestContext);
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
