using System.Text.Json;
using System.Text;
using System.Diagnostics;
using Lattice.AI.Runtime.ApplicationContext;
using Lattice.AI.Runtime.ContextCompilation;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Contracts.Authorization;
using Lattice.AI.Runtime.Contracts.Context;
using Lattice.AI.Runtime.Contracts.Conversation;
using Lattice.AI.Runtime.Contracts.Evidence;
using Lattice.AI.Runtime.Contracts.Generation;
using Lattice.AI.Runtime.Contracts.Requests;
using Lattice.AI.Runtime.Contracts.Scope;
using Lattice.AI.Runtime.EntityResolution;
using Lattice.AI.Runtime.Evidence;
using Lattice.AI.Runtime.FactEvidence;
using Lattice.AI.Runtime.Generation;
using Lattice.AI.Runtime.Prompts;
using Lattice.AI.Runtime.QuestionUnderstanding;
using Lattice.AI.Runtime.ScopePlanning;
using Lattice.AI.Runtime.SourceEvidence;
using Lattice.AI.Runtime.Telemetry;
using Lattice.AI.Runtime.Validation;

namespace Lattice.AI.Runtime.Application;

public sealed class ImpactAnswerService(
    IQuestionInterpreter questionInterpreter,
    IConversationTurnInterpreter conversationTurnInterpreter,
    IEngineeringEntityResolver entityResolver,
    IScopePlanner scopePlanner,
    IEngineeringEvidenceSource evidenceSource,
    ISourceEvidenceRetriever sourceEvidenceRetriever,
    IFactEvidenceRetriever factEvidenceRetriever,
    IApplicationContextRetriever applicationContextRetriever,
    IContextCompiler contextCompiler,
    IPromptCatalog promptCatalog,
    IPromptAssembler promptAssembler,
    IModelGateway modelGateway,
    IAnswerCandidateParser answerCandidateParser,
    IAnswerValidator answerValidator,
    ModelConfiguration modelConfiguration,
    TimeProvider? timeProvider = null,
    IAiRuntimeTelemetry? telemetry = null,
    ConversationStateRetentionOptions? conversationStateRetention = null,
    ICopilotExecutionTrace? executionTrace = null) : IImpactAnswerService
{
    private const string ResolveEntityGrant = "investigation:resolve-entity";
    private const string ReadImpactEvidenceGrant = "investigation:read-impact-evidence";
    private const string PromptId = "engineering-impact";
    private const string PromptVersion = "v2";
    private const string RequestBriefPromptId = "engineering-request-brief";
    private const string RequestBriefPromptVersion = "v1";
    private const string RequestBriefOutputSchemaVersion = "request-brief-v1";
    private const string RequestBriefInstructions =
        "Prepare an engineering request brief for later pipeline stages; do not answer the question. " +
        "Use the original request and all preceding user/assistant messages as conversational context. " +
        "Describe the engineer's request, points to cover, explicitly mentioned item names or identifiers, " +
        "useful alternate search phrasings, and a helpful answer shape. Preserve the user's terminology and uncertainty. " +
        "Do not invent facts, canonical identities, relationships, permissions, or source records. " +
        "Return a concise JSON object with descriptive text and lists, not closed intent labels.";
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
    private ICopilotExecutionTrace? ExecutionTrace { get; } = executionTrace;

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
        WriteTrace(
            requestContext,
            "request.started",
            "runtime",
            request.InvestigationId,
            outcome: "started",
            input: new { questionCharacters = request.Question.Length },
            fullPayload: new { question = request.Question });
        if (!HasRequiredAuthorization(authorization))
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "authorization",
                request.InvestigationId,
                outcome: "denied");
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Deny,
                issues: [new ValidationIssue("authorization-unavailable", "The current authorization does not permit impact answering.")]);
        }

        TimeSpan? conversationStateLifetime;
        try
        {
            conversationStateLifetime = conversationStateRetention?.GetLifetime();
        }
        catch (InvalidOperationException)
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "conversation-state",
                request.InvestigationId,
                outcome: "failed",
                diagnostics: new { reasonCode = "CONVERSATION_STATE_RETENTION_INVALID" });
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue(
                    "conversation-state-retention-invalid",
                    "The conversation-state retention period must be positive.")]);
        }

        if (modelConfiguration.MaxInputTokens <= 0 ||
            modelConfiguration.MaxOutputTokens <= 0 ||
            modelConfiguration.MaxOutputTokens >= modelConfiguration.MaxInputTokens)
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "model-configuration",
                request.InvestigationId,
                outcome: "failed",
                diagnostics: new { reasonCode = "MODEL_INPUT_BUDGET_NOT_CONFIGURED" });
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                issues: [new ValidationIssue(
                    "model-input-budget-not-configured",
                    "The answer model input budget is not configured.")]);
        }

        var hasConversationHistory = request.ConversationHistory is { Count: > 0 };
        var requestBrief = hasConversationHistory
            ? await GenerateRequestBriefAsync(
                request,
                requestContext,
                cancellationToken).ConfigureAwait(false)
            : null;

        var stateInvalidationReason = GetConversationStateInvalidationReason(
            request.PreviousConversationState,
            request,
            requestContext,
            authorization);
        if (stateInvalidationReason is { } invalidationReason)
        {
            Telemetry.RecordConversationStateInvalidation(invalidationReason);
        }
        var priorConversationState = stateInvalidationReason is null
            ? request.PreviousConversationState
            : null;
        var conversationInterpretationStarted = Stopwatch.GetTimestamp();
        var turnInterpretation = await conversationTurnInterpreter.InterpretAsync(
            new ConversationTurnInput(
                request.Question,
                request.InvestigationId,
                request.ConversationId ?? requestContext.ConversationId ?? string.Empty,
                requestContext.TurnId ?? requestContext.RequestId,
                request.ParentTurnId,
                priorConversationState),
            requestContext,
            cancellationToken).ConfigureAwait(false);
        WriteTrace(
            requestContext,
            "conversation.interpreted",
            "question-interpretation",
            request.InvestigationId,
            outcome: "completed",
            durationMs: (long)Stopwatch.GetElapsedTime(conversationInterpretationStarted).TotalMilliseconds,
            input: new { questionCharacters = request.Question.Length },
            output: new
            {
                turnInterpretation.Type,
                turnInterpretation.ClarificationRequired,
                turnInterpretation.IsAmbiguous,
                explicitIdentifierCount = turnInterpretation.ExplicitIdentifiers.Count,
                referenceCandidateIds = turnInterpretation.ReferenceCandidateIds,
                reasonCodes = turnInterpretation.ReasonCodes
            },
            fullPayload: new { question = request.Question, interpretation = turnInterpretation });
        var hasExplicitReference = turnInterpretation.ExplicitIdentifiers.Count > 0;
        var referenceResolution = turnInterpretation.IsAmbiguous
            ? ConversationReferenceResolution.Ambiguous
            : hasExplicitReference
                ? ConversationReferenceResolution.Explicit
                : turnInterpretation.ReferenceCandidateIds.Count > 0
                    ? ConversationReferenceResolution.Inherited
                    : turnInterpretation.ClarificationRequired
                        ? ConversationReferenceResolution.Unavailable
                        : ConversationReferenceResolution.None;
        var filterChanged =
            turnInterpretation.FilterDelta.RequestedSourceApplications is { Count: > 0 } ||
            turnInterpretation.FilterDelta.RequestedTargetApplications is { Count: > 0 } ||
            turnInterpretation.FilterDelta.RequestedRelationshipTerms is { Count: > 0 } ||
            turnInterpretation.FilterDelta.MaxHops is not null ||
            turnInterpretation.FilterDelta.AsOf is not null;
        var parentTurnCorrelated = priorConversationState is not null &&
            string.Equals(priorConversationState.PreviousTurnId, request.ParentTurnId, StringComparison.Ordinal);
        Telemetry.RecordConversationTurn(new ConversationTurnTelemetry(
            turnInterpretation.Type,
            referenceResolution,
            hasExplicitReference ? 0 : turnInterpretation.ReferenceCandidateIds.Count,
            filterChanged,
            turnInterpretation.ClarificationRequired,
            parentTurnCorrelated));

        QuestionInterpretation interpretation;
        var isConversationFollowUp = false;
        var questionInterpretationStarted = Stopwatch.GetTimestamp();
        if (turnInterpretation.Type is ConversationTurnType.NewImpactQuestion or ConversationTurnType.Unsupported)
        {
            interpretation = questionInterpreter.Interpret(request, requestContext);
        }
        else if (CanResolveAsFreshImpactTurn(turnInterpretation))
        {
            isConversationFollowUp = true;
            interpretation = new QuestionInterpretation(
                ImpactQuestionType.EngineeringImpact,
                request.Question,
                null,
                turnInterpretation.ReferenceCandidateIds[0],
                null,
                []);
        }
        else
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "question-interpretation",
                request.InvestigationId,
                outcome: "clarify",
                output: new { reasonCode = "CONVERSATION_FOLLOW_UP_UNRESOLVED" });
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Clarify,
                issues: [CreateFollowUpIssue(turnInterpretation)]);
        }

        WriteTrace(
            requestContext,
            "question.interpreted",
            "question-interpretation",
            request.InvestigationId,
            outcome: interpretation.Type.ToString(),
            durationMs: (long)Stopwatch.GetElapsedTime(questionInterpretationStarted).TotalMilliseconds,
            input: new { questionCharacters = request.Question.Length },
            output: new
            {
                interpretation.CandidateEntityId,
            interpretation.CandidateEntityType,
                interpretation.Type,
                interpretation.ClarificationReasons
            },
            fullPayload: new { question = request.Question, interpretation });
        WriteTrace(
            requestContext,
            "routing.decided",
            "routing",
            request.InvestigationId,
            outcome: "runtime",
            output: new
            {
                route = isConversationFollowUp ? "conversation-follow-up" : "new-question",
                questionType = interpretation.Type,
                conversationTurnType = turnInterpretation.Type,
                interpretation.CandidateEntityId
            });

        if (interpretation.Type is not (ImpactQuestionType.EngineeringImpact or ImpactQuestionType.InvestigationQuestion) ||
            interpretation.ClarificationReasons.Count > 0)
        {
            WriteTrace(
                requestContext,
                "request.completed",
                "question-interpretation",
                request.InvestigationId,
                outcome: "clarify",
                output: new { interpretation.ClarificationReasons });
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Clarify,
                issues: ToIssues("question-clarification-required", interpretation.ClarificationReasons));
        }

        PromptBundle prompt;
        int contextTokenAllowance;
        var promptSelectionStarted = Stopwatch.GetTimestamp();
        using (var promptStage = Telemetry.StartStage(
            "prompt",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                prompt = promptCatalog.GetRequired(PromptId, PromptVersion);
                var fixedPromptTokens = promptAssembler.EstimateFixedPromptTokens(
                    request,
                    prompt,
                    modelConfiguration.TokenizerModelName);
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
                WriteTrace(
                    requestContext,
                    "prompt.selection.failed",
                    "prompt-selection",
                    request.InvestigationId,
                    outcome: "failed",
                    durationMs: (long)Stopwatch.GetElapsedTime(promptSelectionStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "PROMPT_SELECTION_FAILED", errorType = exception.GetType().Name });
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
                promptStage.SetDisposition("failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    issues: [new ValidationIssue(
                        "model-input-budget-exceeded",
                        "The configured model input budget cannot fit the fixed prompt and output reservation.")]);
            }
        }
        WriteTrace(
            requestContext,
            "prompt.selected",
            "prompt",
            request.InvestigationId,
            outcome: "ready",
            output: new
            {
                prompt.Id,
                prompt.Version,
                modelConfiguration.Provider,
                modelConfiguration.DeploymentName,
                modelConfiguration.MaxInputTokens,
                modelConfiguration.MaxOutputTokens,
                contextTokenAllowance
            },
            fullPayload: prompt);

        ResolvedEntity? subject = null;
        if (interpretation.CandidateEntityId is { Length: > 0 })
        {
            EntityResolutionResult resolution;
            var resolutionStarted = Stopwatch.GetTimestamp();
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
                    WriteTrace(
                        requestContext,
                        "entity-resolution.cancelled",
                        "entity-resolution",
                        request.InvestigationId,
                        outcome: "cancelled",
                        durationMs: (long)Stopwatch.GetElapsedTime(resolutionStarted).TotalMilliseconds);
                    resolutionStage.SetFailure("other");
                    resolutionStage.SetDisposition("cancelled");
                    throw;
                }
                catch (OperationCanceledException)
                {
                    WriteTrace(
                        requestContext,
                        "entity-resolution.failed",
                        "entity-resolution",
                        request.InvestigationId,
                        outcome: "timeout",
                        durationMs: (long)Stopwatch.GetElapsedTime(resolutionStarted).TotalMilliseconds,
                        diagnostics: new { reasonCode = "ENTITY_RESOLUTION_TIMEOUT" });
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
                    WriteTrace(
                        requestContext,
                        "entity-resolution.failed",
                        "entity-resolution",
                        request.InvestigationId,
                        outcome: "failed",
                        durationMs: (long)Stopwatch.GetElapsedTime(resolutionStarted).TotalMilliseconds,
                        diagnostics: new { reasonCode = "ENTITY_RESOLUTION_FAILED", errorType = exception.GetType().Name });
                    resolutionStage.SetFailure("entity-resolution-failed");
                    return CreateResult(
                        request.InvestigationId,
                        requestContext,
                        AnswerDisposition.Failed,
                        issues: [new ValidationIssue("entity-resolution-failed", "The engineering subject could not be resolved.")]);
                }
            }
            WriteTrace(
                requestContext,
                "entity-resolution.completed",
                "entity-resolution",
                request.InvestigationId,
                outcome: resolution.Disposition.ToString(),
                durationMs: (long)Stopwatch.GetElapsedTime(resolutionStarted).TotalMilliseconds,
                input: new
                {
                    interpretation.CandidateEntityId,
                    interpretation.CandidateEntityType
                },
                output: new
                {
                    canonicalEntityId = resolution.Entity?.CanonicalId,
                    system = resolution.Entity?.System,
                    entityType = resolution.Entity?.EntityType,
                    diagnostics = resolution.Diagnostics
                },
                fullPayload: new { resolution });

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
                if (isConversationFollowUp)
                {
                    Telemetry.RecordConversationStateInvalidation(ConversationStateInvalidationReason.SubjectUnavailable);
                }
                var reasons = resolution.Diagnostics.Count > 0
                    ? resolution.Diagnostics
                    : interpretation.ClarificationReasons;
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Clarify,
                    issues: ToIssues("subject-clarification-required", reasons));
            }

            subject = resolution.Entity;
        }

        ScopePlanningResult plannedScope;
        var scopePlanningStarted = Stopwatch.GetTimestamp();
        using (var scopeStage = Telemetry.StartStage(
            "scope-planning",
            requestContext,
            request.InvestigationId))
        {
            plannedScope = subject is null
                ? scopePlanner.Plan(
                    interpretation,
                    null,
                    authorization.Scope,
                    requestContext)
                : isConversationFollowUp
                ? scopePlanner.Plan(
                    turnInterpretation,
                    priorConversationState,
                    subject,
                    authorization,
                    requestContext)
                : scopePlanner.Plan(
                    interpretation,
                    subject,
                    authorization.Scope,
                    requestContext);
            scopeStage.SetDisposition(plannedScope.Disposition.ToString());
        }
        WriteTrace(
            requestContext,
            "retrieval-plan.created",
            "scope-planning",
            request.InvestigationId,
            outcome: plannedScope.Disposition.ToString(),
            durationMs: (long)Stopwatch.GetElapsedTime(scopePlanningStarted).TotalMilliseconds,
            input: new
            {
                entityId = subject?.CanonicalId,
                questionType = interpretation.Type.ToString()
            },
            output: new
            {
                scopeAvailable = plannedScope.Scope is not null,
                plannedScope.Diagnostics,
                requestedFactFieldIds = interpretation.RequestedFactFieldIds,
                requestedSourceApplications = interpretation.RequestedSourceApplications,
                plannedScope.SourceEvidencePlan,
                plannedScope.FactEvidencePlan,
                plannedScope.ApplicationContextPlan
            },
            fullPayload: new { plannedScope });
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
        var plmRetrievalSucceeded = true;
        var plmRetrievalStarted = Stopwatch.GetTimestamp();
        WriteTrace(
            requestContext,
            "retrieval.started",
            "plm-retrieval",
            request.InvestigationId,
            outcome: "started",
            input: new
            {
                retrievalScope = subject is null ? "investigation" : "impact",
                subjectId = subject?.CanonicalId,
                subjectSystem = subject?.System,
                subjectType = subject?.EntityType,
                plannedScope.Scope.RelationshipTypes,
                plannedScope.Scope.SourceSystems
            });
        using (var retrievalStage = Telemetry.StartStage(
            "plm-retrieval",
            requestContext,
            request.InvestigationId))
        {
            try
            {
                Telemetry.RecordConversationRetrieval(isConversationFollowUp);
                evidence = subject is null
                    ? await evidenceSource.RetrieveInvestigationAsync(
                        new InvestigationEvidenceQuery(
                            request.InvestigationId,
                            authorization,
                            requestContext),
                        cancellationToken).ConfigureAwait(false)
                    : await evidenceSource.RetrieveImpactAsync(
                        new ImpactEvidenceQuery(
                            request.InvestigationId,
                            subject,
                            plannedScope.Scope,
                            authorization,
                            requestContext),
                        cancellationToken).ConfigureAwait(false);
                plmRetrievalSucceeded = true;
                retrievalStage.SetDisposition("completed");
                if (priorConversationState is not null &&
                    !string.Equals(priorConversationState.SourceVersion, evidence.SourceVersion, StringComparison.Ordinal))
                {
                    Telemetry.RecordConversationStateInvalidation(ConversationStateInvalidationReason.SourceVersionChanged);
                }
                if (priorConversationState is not null &&
                    !string.Equals(priorConversationState.OntologyVersion, evidence.OntologyVersion, StringComparison.Ordinal))
                {
                    Telemetry.RecordConversationStateInvalidation(ConversationStateInvalidationReason.OntologyVersionChanged);
                }
                retrievalStage.SetTag("evidence.relationship_count", evidence.Relationships.Count);
                retrievalStage.SetTag("evidence.path_count", evidence.Paths.Count);
                retrievalStage.SetTag("evidence.chain_count", evidence.Chains.Count);
                retrievalStage.SetTag("evidence.source_count", evidence.Sources.Count);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                WriteTrace(requestContext, "retrieval.cancelled", "plm-retrieval", request.InvestigationId, outcome: "cancelled");
                retrievalStage.SetFailure("other");
                retrievalStage.SetDisposition("cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "plm-retrieval",
                    request.InvestigationId,
                    outcome: "timeout",
                    durationMs: (long)Stopwatch.GetElapsedTime(plmRetrievalStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "PLM_RETRIEVAL_TIMEOUT" });
                retrievalStage.SetFailure("plm-retrieval-timeout");
                evidence = EmptyEvidenceAfterRetrievalFailure(request.InvestigationId, authorization, requestContext);
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException)
            {
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "plm-retrieval",
                    request.InvestigationId,
                    outcome: "failed",
                    durationMs: (long)Stopwatch.GetElapsedTime(plmRetrievalStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "PLM_RETRIEVAL_FAILED", errorType = exception.GetType().Name });
                retrievalStage.SetFailure("plm-retrieval-failed");
                evidence = EmptyEvidenceAfterRetrievalFailure(request.InvestigationId, authorization, requestContext);
            }
        }
        WriteTrace(
            requestContext,
            "retrieval.completed",
            "plm-retrieval",
            request.InvestigationId,
            outcome: plmRetrievalSucceeded ? "completed" : "failed",
            durationMs: (long)Stopwatch.GetElapsedTime(plmRetrievalStarted).TotalMilliseconds,
            input: new
            {
                retrievalScope = subject is null ? "investigation" : "impact",
                subjectId = subject?.CanonicalId,
                relationshipTypeCount = plannedScope.Scope!.RelationshipTypes.Count,
                sourceSystemCount = plannedScope.Scope.SourceSystems.Count
            },
            output: new
            {
                relationshipCount = evidence.Relationships.Count,
                pathCount = evidence.Paths.Count,
                chainCount = evidence.Chains.Count,
                sourceCount = evidence.Sources.Count,
                applications = evidence.Sources
                    .Select(source => source.SourceSystem)
                    .Distinct(StringComparer.Ordinal)
                    .Order(StringComparer.Ordinal)
                    .ToArray(),
                evidence.SourceVersion,
                evidence.OntologyVersion
            },
            fullPayload: evidence,
            itemsAdded: requestContext.FullPayloadTraceEnabled
                ? evidence.Relationships.Select(relationship => $"relationship:{relationship.RelationshipId}")
                    .Concat(evidence.Paths.Select(path => $"path:{path.PathId}"))
                    .Concat(evidence.Chains.Select(chain => chain.ChainId))
                    .Concat(evidence.Sources.Select(source => source.EvidenceId))
                    .ToArray()
                : []);

        SourceEvidenceRetrievalResult? sourceEvidence = null;
        if (plannedScope.SourceEvidencePlan is { Requested: true } sourceEvidencePlan)
        {
            var sourceEvidenceStarted = Stopwatch.GetTimestamp();
            WriteTrace(
                requestContext,
                "retrieval.started",
                "source-evidence-retrieval",
                request.InvestigationId,
                outcome: "started",
                input: requestContext.FullPayloadTraceEnabled
                    ? (object)new
                    {
                        sourceEvidencePlan.LinkedEntityIds,
                        sourceEvidencePlan.SourceApplications,
                        sourceEvidencePlan.ExactIdentifiers,
                        sourceEvidencePlan.ReasonCode
                    }
                    : new
                    {
                        linkedEntityCount = sourceEvidencePlan.LinkedEntityIds.Count,
                        sourceEvidencePlan.SourceApplications,
                        exactIdentifierCount = sourceEvidencePlan.ExactIdentifiers.Count,
                        sourceEvidencePlan.ReasonCode
                    });
            using var sourceEvidenceStage = Telemetry.StartStage(
                "source-evidence-retrieval",
                requestContext,
                request.InvestigationId);
            try
            {
                var relevantEntityIds = sourceEvidencePlan.LinkedEntityIds
                    .Where(entityId => !string.IsNullOrWhiteSpace(entityId))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
                if (subject is not null &&
                    !relevantEntityIds.Contains(subject.CanonicalId, StringComparer.Ordinal))
                {
                    throw new InvalidOperationException(
                        "The source-evidence plan is not linked to the resolved subject.");
                }

                var query = new SourceEvidenceQuery(
                    request.InvestigationId,
                    subject,
                    Array.AsReadOnly(relevantEntityIds),
                    sourceEvidencePlan.SourceApplications,
                    sourceEvidencePlan.ExactIdentifiers,
                    authorization,
                    requestContext);
                var retrievedSourceEvidence = await sourceEvidenceRetriever.RetrieveAsync(
                    query,
                    cancellationToken).ConfigureAwait(false);
                if (retrievedSourceEvidence is null ||
                    !string.Equals(retrievedSourceEvidence.InvestigationId, query.InvestigationId, StringComparison.Ordinal) ||
                    !string.Equals(
                        retrievedSourceEvidence.AuthorizationDecisionId,
                        query.Authorization.Scope.DecisionId,
                        StringComparison.Ordinal) ||
                    !string.Equals(retrievedSourceEvidence.RequestId, query.RequestContext.RequestId, StringComparison.Ordinal) ||
                    !string.Equals(retrievedSourceEvidence.TraceId, query.RequestContext.TraceId, StringComparison.Ordinal) ||
                    retrievedSourceEvidence.Passages is null)
                {
                    throw new InvalidOperationException(
                        "The source-evidence result is not bound to the current authorized request.");
                }

                sourceEvidence = retrievedSourceEvidence;
                sourceEvidenceStage.SetDisposition(
                    retrievedSourceEvidence.Passages.Count == 0 ? "empty" : "completed");
                sourceEvidenceStage.SetTag("source_evidence.passage_count", retrievedSourceEvidence.Passages.Count);
                WriteTrace(
                    requestContext,
                    "retrieval.completed",
                    "source-evidence-retrieval",
                    request.InvestigationId,
                    outcome: retrievedSourceEvidence.Passages.Count == 0 ? "empty" : "completed",
                    durationMs: (long)Stopwatch.GetElapsedTime(sourceEvidenceStarted).TotalMilliseconds,
                    input: requestContext.FullPayloadTraceEnabled
                        ? (object)new
                        {
                            linkedEntityIds = relevantEntityIds,
                            sourceEvidencePlan.SourceApplications,
                            sourceEvidencePlan.ExactIdentifiers
                        }
                        : new
                        {
                            linkedEntityCount = relevantEntityIds.Length,
                            sourceEvidencePlan.SourceApplications,
                            exactIdentifierCount = sourceEvidencePlan.ExactIdentifiers.Count
                        },
                    output: new
                    {
                        retrievedSourceEvidence.SnapshotRevision,
                        retrievedSourceEvidence.SourceVersion,
                        passageCount = retrievedSourceEvidence.Passages.Count,
                        applications = retrievedSourceEvidence.Passages
                            .Select(passage => passage.SourceApplication)
                            .Distinct(StringComparer.Ordinal)
                            .Order(StringComparer.Ordinal)
                            .ToArray(),
                        passageIds = requestContext.FullPayloadTraceEnabled
                            ? retrievedSourceEvidence.Passages.Select(passage => passage.PassageId).ToArray()
                            : Array.Empty<string>(),
                        retrievedSourceEvidence.Diagnostics
                    },
                    fullPayload: retrievedSourceEvidence,
                    snapshotRevision: retrievedSourceEvidence.SnapshotRevision,
                    itemsAdded: requestContext.FullPayloadTraceEnabled
                        ? retrievedSourceEvidence.Passages.Select(passage => passage.PassageId).ToArray()
                        : []);
            }
            catch (SourceEvidenceUnavailableException exception)
            {
                sourceEvidenceStage.SetFailure("source-evidence-unavailable");
                sourceEvidenceStage.SetDisposition("unavailable");
                WriteTrace(
                    requestContext,
                    "retrieval.unavailable",
                    "source-evidence-retrieval",
                    request.InvestigationId,
                    outcome: "unavailable",
                    durationMs: (long)Stopwatch.GetElapsedTime(sourceEvidenceStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "SOURCE_EVIDENCE_PROVIDER_UNAVAILABLE", errorType = exception.GetType().Name });
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                sourceEvidenceStage.SetFailure("other");
                sourceEvidenceStage.SetDisposition("cancelled");
                WriteTrace(requestContext, "retrieval.cancelled", "source-evidence-retrieval", request.InvestigationId, outcome: "cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                sourceEvidenceStage.SetFailure("source-evidence-retrieval-timeout");
                sourceEvidenceStage.SetDisposition("failed");
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "source-evidence-retrieval",
                    request.InvestigationId,
                    outcome: "timeout",
                    durationMs: (long)Stopwatch.GetElapsedTime(sourceEvidenceStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "SOURCE_EVIDENCE_RETRIEVAL_TIMEOUT" });
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException or ArgumentException)
            {
                sourceEvidenceStage.SetFailure("source-evidence-retrieval-failed");
                sourceEvidenceStage.SetDisposition("failed");
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "source-evidence-retrieval",
                    request.InvestigationId,
                    outcome: "failed",
                    durationMs: (long)Stopwatch.GetElapsedTime(sourceEvidenceStarted).TotalMilliseconds,
                    diagnostics: new
                    {
                        reasonCode = exception is InvalidOperationException
                            ? "SOURCE_EVIDENCE_RESULT_INVALID_OR_UNBOUND"
                            : "SOURCE_EVIDENCE_RETRIEVAL_FAILED",
                        errorType = exception.GetType().Name
                    });
            }
        }
        else
        {
            WriteTrace(
                requestContext,
                "retrieval.not-run",
                "source-evidence-retrieval",
                request.InvestigationId,
                outcome: "not-requested",
                diagnostics: new
                {
                    reasonCode = plannedScope.SourceEvidencePlan?.ReasonCode ?? "NO_SOURCE_EVIDENCE_PLAN",
                    requested = plannedScope.SourceEvidencePlan?.Requested ?? false
                });
        }

        FactEvidenceRetrievalResult? factEvidence = null;
        if (plannedScope.FactEvidencePlan is { Requested: true } factEvidencePlan)
        {
            var factEvidenceStarted = Stopwatch.GetTimestamp();
            WriteTrace(
                requestContext,
                "retrieval.started",
                "fact-retrieval",
                request.InvestigationId,
                outcome: "started",
                input: requestContext.FullPayloadTraceEnabled
                    ? (object)new
                    {
                        factEvidencePlan.LinkedEntityIds,
                        factEvidencePlan.SourceApplications,
                        factEvidencePlan.FieldIds,
                        factEvidencePlan.ExactIdentifiers,
                        factEvidencePlan.ReasonCode
                    }
                    : new
                    {
                        linkedEntityCount = factEvidencePlan.LinkedEntityIds.Count,
                        factEvidencePlan.SourceApplications,
                        fieldCount = factEvidencePlan.FieldIds.Count,
                        exactIdentifierCount = factEvidencePlan.ExactIdentifiers.Count,
                        factEvidencePlan.ReasonCode
                    });
            using var factEvidenceStage = Telemetry.StartStage(
                "fact-evidence-retrieval",
                requestContext,
                request.InvestigationId);
            try
            {
                var query = new FactEvidenceQuery(
                    request.InvestigationId,
                    subject,
                    factEvidencePlan,
                    evidence.SourceVersion,
                    evidence.OntologyVersion,
                    authorization,
                    requestContext);
                var retrieved = await factEvidenceRetriever.RetrieveAsync(
                    query,
                    cancellationToken).ConfigureAwait(false);
                if (!IsBoundToRequest(retrieved, query))
                {
                    throw new InvalidOperationException(
                        "The fact-evidence result is not bound to the current authorized request.");
                }

                factEvidence = retrieved;
                factEvidenceStage.SetDisposition(retrieved.Facts.Count == 0 ? "empty" : "completed");
                factEvidenceStage.SetTag("fact_evidence.fact_count", retrieved.Facts.Count);
                WriteTrace(
                    requestContext,
                    "retrieval.completed",
                    "fact-retrieval",
                    request.InvestigationId,
                    outcome: retrieved.Facts.Count == 0 ? "empty" : "completed",
                    durationMs: (long)Stopwatch.GetElapsedTime(factEvidenceStarted).TotalMilliseconds,
                    input: requestContext.FullPayloadTraceEnabled
                        ? (object)new
                        {
                            plan = factEvidencePlan,
                            entityId = subject?.CanonicalId
                        }
                        : new
                        {
                            linkedEntityCount = factEvidencePlan.LinkedEntityIds.Count,
                            sourceApplicationCount = factEvidencePlan.SourceApplications.Count,
                            fieldCount = factEvidencePlan.FieldIds.Count,
                            exactIdentifierCount = factEvidencePlan.ExactIdentifiers.Count,
                            entityId = subject?.CanonicalId
                        },
                    output: new
                    {
                        retrieved.SnapshotRevision,
                        retrieved.SourceVersion,
                        retrieved.OntologyVersion,
                        factCount = retrieved.Facts.Count,
                        applications = retrieved.Facts
                            .Select(fact => fact.SourceApplication)
                            .Distinct(StringComparer.Ordinal)
                            .Order(StringComparer.Ordinal)
                            .ToArray(),
                        fieldCount = retrieved.Facts.Select(fact => fact.FieldId).Distinct(StringComparer.Ordinal).Count(),
                        fields = requestContext.FullPayloadTraceEnabled
                            ? retrieved.Facts.Select(fact => fact.FieldId).Distinct(StringComparer.Ordinal).ToArray()
                            : Array.Empty<string>(),
                        factIds = requestContext.FullPayloadTraceEnabled
                            ? retrieved.Facts.Select(fact => fact.FactId).ToArray()
                            : Array.Empty<string>()
                    },
                    fullPayload: retrieved,
                    snapshotRevision: retrieved.SnapshotRevision,
                    itemsAdded: requestContext.FullPayloadTraceEnabled
                        ? retrieved.Facts.Select(fact => fact.FactId).ToArray()
                        : []);
            }
            catch (FactEvidenceUnavailableException exception)
            {
                factEvidenceStage.SetFailure("fact-evidence-unavailable");
                factEvidenceStage.SetDisposition("unavailable");
                WriteTrace(
                    requestContext,
                    "retrieval.unavailable",
                    "fact-retrieval",
                    request.InvestigationId,
                    outcome: "unavailable",
                    durationMs: (long)Stopwatch.GetElapsedTime(factEvidenceStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "FACT_PROVIDER_UNAVAILABLE", errorType = exception.GetType().Name });
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                factEvidenceStage.SetFailure("other");
                factEvidenceStage.SetDisposition("cancelled");
                WriteTrace(requestContext, "retrieval.cancelled", "fact-retrieval", request.InvestigationId, outcome: "cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                factEvidenceStage.SetFailure("fact-evidence-retrieval-timeout");
                factEvidenceStage.SetDisposition("failed");
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "fact-retrieval",
                    request.InvestigationId,
                    outcome: "timeout",
                    durationMs: (long)Stopwatch.GetElapsedTime(factEvidenceStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "FACT_RETRIEVAL_TIMEOUT" });
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException or ArgumentException)
            {
                factEvidenceStage.SetFailure("fact-evidence-retrieval-failed");
                factEvidenceStage.SetDisposition("failed");
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "fact-retrieval",
                    request.InvestigationId,
                    outcome: "failed",
                    durationMs: (long)Stopwatch.GetElapsedTime(factEvidenceStarted).TotalMilliseconds,
                    diagnostics: new
                    {
                        reasonCode = exception is InvalidOperationException
                            ? "FACT_RESULT_INVALID_OR_UNBOUND"
                            : "FACT_RETRIEVAL_FAILED",
                        errorType = exception.GetType().Name
                    });
            }
        }
        else
        {
            WriteTrace(
                requestContext,
                "retrieval.not-run",
                "fact-retrieval",
                request.InvestigationId,
                outcome: "not-requested",
                diagnostics: new
                {
                    reasonCode = plannedScope.FactEvidencePlan?.ReasonCode ?? "NO_FACT_EVIDENCE_PLAN",
                    requested = plannedScope.FactEvidencePlan?.Requested ?? false
                });
        }

        ApplicationContextRetrievalResult? applicationContext = null;
        if (plannedScope.ApplicationContextPlan is { Requested: true } applicationContextPlan)
        {
            var applicationContextStarted = Stopwatch.GetTimestamp();
            WriteTrace(
                requestContext,
                "retrieval.started",
                "application-digest-retrieval",
                request.InvestigationId,
                outcome: "started",
                input: requestContext.FullPayloadTraceEnabled
                    ? (object)new
                    {
                        applicationContextPlan.LinkedEntityIds,
                        applicationContextPlan.SourceApplications,
                        applicationContextPlan.ReasonCode
                    }
                    : new
                    {
                        linkedEntityCount = applicationContextPlan.LinkedEntityIds.Count,
                        applicationContextPlan.SourceApplications,
                        applicationContextPlan.ReasonCode
                    });
            using var applicationContextStage = Telemetry.StartStage(
                "application-context-retrieval",
                requestContext,
                request.InvestigationId);
            try
            {
                var query = new ApplicationContextQuery(
                    request.InvestigationId,
                    subject,
                    applicationContextPlan,
                    evidence.SourceVersion,
                    evidence.OntologyVersion,
                    authorization,
                    requestContext);
                var retrieved = await applicationContextRetriever.RetrieveAsync(
                    query,
                    cancellationToken).ConfigureAwait(false);
                if (!IsBoundToRequest(retrieved, query))
                {
                    throw new InvalidOperationException(
                        "The application-context result is not bound to the current authorized request.");
                }

                applicationContext = retrieved;
                applicationContextStage.SetDisposition(
                    retrieved.Participations.Count == 0 ? "empty" : "completed");
                applicationContextStage.SetTag(
                    "application_context.participation_count",
                    retrieved.Participations.Count);
                WriteTrace(
                    requestContext,
                    "retrieval.completed",
                    "application-digest-retrieval",
                    request.InvestigationId,
                    outcome: retrieved.Participations.Count == 0 ? "empty" : "completed",
                    durationMs: (long)Stopwatch.GetElapsedTime(applicationContextStarted).TotalMilliseconds,
                    input: requestContext.FullPayloadTraceEnabled
                        ? (object)new
                        {
                            plan = applicationContextPlan,
                            entityId = subject?.CanonicalId
                        }
                        : new
                        {
                            linkedEntityCount = applicationContextPlan.LinkedEntityIds.Count,
                            sourceApplicationCount = applicationContextPlan.SourceApplications.Count,
                            entityId = subject?.CanonicalId
                        },
                    output: new
                    {
                        retrieved.SnapshotRevision,
                        retrieved.SourceVersion,
                        retrieved.OntologyVersion,
                        participationCount = retrieved.Participations.Count,
                        applications = retrieved.Participations
                            .Select(participation => participation.SourceApplication)
                            .Distinct(StringComparer.Ordinal)
                            .Order(StringComparer.Ordinal)
                            .ToArray(),
                        candidateIds = requestContext.FullPayloadTraceEnabled
                            ? retrieved.Participations.Select(participation => participation.CandidateId).ToArray()
                            : Array.Empty<string>()
                    },
                    fullPayload: retrieved,
                    snapshotRevision: retrieved.SnapshotRevision,
                    itemsAdded: requestContext.FullPayloadTraceEnabled
                        ? retrieved.Participations.Select(participation => participation.CandidateId).ToArray()
                        : []);
            }
            catch (ApplicationContextUnavailableException exception)
            {
                applicationContextStage.SetFailure("application-context-unavailable");
                applicationContextStage.SetDisposition("unavailable");
                WriteTrace(
                    requestContext,
                    "retrieval.unavailable",
                    "application-digest-retrieval",
                    request.InvestigationId,
                    outcome: "unavailable",
                    durationMs: (long)Stopwatch.GetElapsedTime(applicationContextStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "APPLICATION_CONTEXT_PROVIDER_UNAVAILABLE", errorType = exception.GetType().Name });
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                applicationContextStage.SetFailure("other");
                applicationContextStage.SetDisposition("cancelled");
                WriteTrace(requestContext, "retrieval.cancelled", "application-digest-retrieval", request.InvestigationId, outcome: "cancelled");
                throw;
            }
            catch (OperationCanceledException)
            {
                applicationContextStage.SetFailure("application-context-retrieval-timeout");
                applicationContextStage.SetDisposition("failed");
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "application-digest-retrieval",
                    request.InvestigationId,
                    outcome: "timeout",
                    durationMs: (long)Stopwatch.GetElapsedTime(applicationContextStarted).TotalMilliseconds,
                    diagnostics: new { reasonCode = "APPLICATION_CONTEXT_RETRIEVAL_TIMEOUT" });
            }
            catch (Exception exception) when (
                exception is HttpRequestException or TimeoutException or InvalidOperationException or ArgumentException)
            {
                applicationContextStage.SetFailure("application-context-retrieval-failed");
                applicationContextStage.SetDisposition("failed");
                WriteTrace(
                    requestContext,
                    "retrieval.failed",
                    "application-digest-retrieval",
                    request.InvestigationId,
                    outcome: "failed",
                    durationMs: (long)Stopwatch.GetElapsedTime(applicationContextStarted).TotalMilliseconds,
                    diagnostics: new
                    {
                        reasonCode = exception is InvalidOperationException
                            ? "APPLICATION_CONTEXT_RESULT_INVALID_OR_UNBOUND"
                            : "APPLICATION_CONTEXT_RETRIEVAL_FAILED",
                        errorType = exception.GetType().Name
                    });
            }
        }
        else
        {
            WriteTrace(
                requestContext,
                "retrieval.not-run",
                "application-digest-retrieval",
                request.InvestigationId,
                outcome: "not-requested",
                diagnostics: new
                {
                    reasonCode = plannedScope.ApplicationContextPlan?.ReasonCode ?? "NO_APPLICATION_CONTEXT_PLAN",
                    requested = plannedScope.ApplicationContextPlan?.Requested ?? false
                });
        }

        var sourceApplicationsRequested = (plannedScope.SourceEvidencePlan?.SourceApplications ?? Array.Empty<string>())
            .Concat(plannedScope.FactEvidencePlan?.SourceApplications ?? Array.Empty<string>())
            .Concat(plannedScope.ApplicationContextPlan?.SourceApplications ?? Array.Empty<string>())
            .Where(application => !string.IsNullOrWhiteSpace(application))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        ContextCompilationResult compilation;
        var contextCompilationStarted = Stopwatch.GetTimestamp();
        using (var compilationStage = Telemetry.StartStage(
            "context-compilation",
            requestContext,
            request.InvestigationId))
        {
            compilation = contextCompiler.Compile(
                new ContextCompilationInput(
                    requestContext,
                    request.InvestigationId,
                    subject,
                    plannedScope.Scope,
                    authorization.Scope,
                    evidence,
                    new ContextBudget(contextTokenAllowance, modelConfiguration.TokenizerModelName),
                    sourceEvidence,
                    factEvidence,
                    applicationContext)
                {
                    RequestedFactCountPerApplication = RequestsSingleFactPerApplication(request.Question) ? 1 : null,
                    RequestedSourceApplications = sourceApplicationsRequested
                });
            var omissions = compilation.Package?.Omissions ?? Array.Empty<ContextOmission>();
            Telemetry.RecordContextQuality(
                omissions.Count,
                compilation.Disposition == CompilationDisposition.ContextWindowExceeded);
            Telemetry.RecordSourceEvidenceOmissions(
                omissions.Count(omission => omission.Kind == ContextOmissionKind.SourceEvidencePassage));
            compilationStage.SetDisposition(compilation.Disposition.ToString());
            if (compilation.Package is not null)
            {
                compilationStage.SetTag("context.compiler.version", compilation.Package.CompilerVersion);
                compilationStage.SetTag("context.package.id", compilation.Package.PackageId);
                compilationStage.SetTag("context.claim_count", compilation.Package.Claims.Count);
                compilationStage.SetTag("context.source_count", compilation.Package.Sources.Count);
                compilationStage.SetTag(
                    "context.source_evidence_passage_count",
                    compilation.Package.SourceEvidencePassages.Count);
                compilationStage.SetTag(
                    "context.source_evidence_omission_count",
                    omissions.Count(omission => omission.Kind == ContextOmissionKind.SourceEvidencePassage));
            }
            if (compilation.Disposition == CompilationDisposition.Denied)
            {
                compilationStage.SetFailure("context-compilation-denied");
                compilationStage.SetDisposition("denied");
            }
        }
        var contextPackage = compilation.Package;
        var candidateApplications = evidence.Sources.Select(source => source.SourceSystem)
            .Concat(sourceEvidence?.Passages.Select(passage => passage.SourceApplication) ?? Array.Empty<string>())
            .Concat(factEvidence?.Facts.Select(fact => fact.SourceApplication) ?? Array.Empty<string>())
            .Concat(applicationContext?.Participations.Select(participation => participation.SourceApplication) ?? Array.Empty<string>())
            .Where(application => !string.IsNullOrWhiteSpace(application))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var contextApplications = contextPackage is null
            ? Array.Empty<string>()
            : contextPackage.Sources.Select(source => source.SourceSystem)
                .Concat(contextPackage.SourceEvidencePassages.Select(passage => passage.SourceApplication))
                .Concat(contextPackage.EngineeringFacts.Select(fact => fact.SourceApplication))
                .Concat(contextPackage.ApplicationParticipation.Select(participation => participation.SourceApplication))
                .Where(application => !string.IsNullOrWhiteSpace(application))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Order(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        var omittedApplications = candidateApplications
            .Except(contextApplications, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var compilerOmissions = contextPackage?.Omissions ?? Array.Empty<ContextOmission>();
        var approvedClaimIds = contextPackage?.Claims
            .Select(claim => claim.ClaimId)
            .ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>(StringComparer.Ordinal);
        var approvedFactIds = contextPackage?.EngineeringFacts
            .Select(fact => fact.FactId)
            .ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>(StringComparer.Ordinal);
        var approvedParticipationIds = contextPackage?.ApplicationParticipation
            .Select(participation => participation.CandidateId)
            .ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>(StringComparer.Ordinal);
        var approvedPassageIds = contextPackage?.SourceEvidencePassages
            .Select(passage => passage.PassageId)
            .ToHashSet(StringComparer.Ordinal) ?? new HashSet<string>(StringComparer.Ordinal);
        var candidateDecisions = requestContext.FullPayloadTraceEnabled
            ? new
            {
            graphRelationships = evidence.Relationships.Select(relationship =>
            {
                var claimId = $"relationship:{relationship.RelationshipId}";
                var omission = compilerOmissions.FirstOrDefault(item =>
                    string.Equals(item.ClaimId, claimId, StringComparison.Ordinal));
                var sources = evidence.Sources.Where(source => relationship.EvidenceIds.Contains(
                    source.EvidenceId,
                    StringComparer.Ordinal));
                return new
                {
                    candidateType = "Graph",
                    candidateId = claimId,
                    application = sources.Select(source => source.SourceSystem).Distinct(StringComparer.Ordinal).ToArray(),
                    authority = sources.Select(source => source.Authority).Distinct(StringComparer.Ordinal).ToArray(),
                    freshness = (string?)null,
                    citationIds = relationship.CitationIds ?? Array.Empty<string>(),
                    relationship.EvidenceIds,
                    provenance = sources.Select(source => new
                    {
                        source.SourceType,
                        source.RecordId,
                        source.Revision,
                        source.ProvenanceId,
                        source.Provider
                    }).ToArray(),
                    approved = approvedClaimIds.Contains(claimId),
                    rejected = omission is not null,
                    decision = approvedClaimIds.Contains(claimId)
                        ? "approved"
                        : omission is not null ? "rejected" : "not-recorded-by-compiler",
                    reason = omission?.Reason
                };
            }).ToArray(),
            graphPaths = evidence.Paths.Select(path =>
            {
                var claimId = $"path:{path.PathId}";
                var omission = compilerOmissions.FirstOrDefault(item =>
                    string.Equals(item.ClaimId, claimId, StringComparison.Ordinal));
                var pathEvidenceIds = path.RelationshipIds
                    .SelectMany(id => evidence.Relationships
                        .Where(relationship => string.Equals(relationship.RelationshipId, id, StringComparison.Ordinal))
                        .SelectMany(relationship => relationship.EvidenceIds))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
                var sources = evidence.Sources.Where(source => pathEvidenceIds.Contains(source.EvidenceId, StringComparer.Ordinal));
                return new
                {
                    candidateType = "Graph",
                    candidateId = claimId,
                    application = sources.Select(source => source.SourceSystem).Distinct(StringComparer.Ordinal).ToArray(),
                    authority = sources.Select(source => source.Authority).Distinct(StringComparer.Ordinal).ToArray(),
                    freshness = (string?)null,
                    citationIds = path.CitationIds ?? Array.Empty<string>(),
                    evidenceIds = pathEvidenceIds,
                    provenance = sources.Select(source => new { source.RecordId, source.ProvenanceId, source.Provider }).ToArray(),
                    approved = approvedClaimIds.Contains(claimId),
                    rejected = omission is not null,
                    decision = approvedClaimIds.Contains(claimId)
                        ? "approved"
                        : omission is not null ? "rejected" : "not-recorded-by-compiler",
                    reason = omission?.Reason
                };
            }).ToArray(),
            graphChains = evidence.Chains.Select(chain =>
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    string.Equals(item.ClaimId, chain.ChainId, StringComparison.Ordinal));
                var sources = evidence.Sources.Where(source => chain.SupportingEvidenceIds.Contains(
                    source.EvidenceId,
                    StringComparer.Ordinal));
                return new
                {
                    candidateType = "Graph",
                    candidateId = chain.ChainId,
                    application = sources.Select(source => source.SourceSystem).Distinct(StringComparer.Ordinal).ToArray(),
                    authority = sources.Select(source => source.Authority).Distinct(StringComparer.Ordinal).ToArray(),
                    freshness = (string?)null,
                    chain.CitationIds,
                    evidenceIds = chain.SupportingEvidenceIds,
                    provenance = sources.Select(source => new { source.RecordId, source.ProvenanceId, source.Provider }).ToArray(),
                    approved = approvedClaimIds.Contains(chain.ChainId),
                    rejected = omission is not null,
                    decision = approvedClaimIds.Contains(chain.ChainId)
                        ? "approved"
                        : omission is not null ? "rejected" : "not-recorded-by-compiler",
                    reason = omission?.Reason
                };
            }).ToArray(),
            facts = factEvidence?.Facts.Select(fact =>
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    item.Kind == ContextOmissionKind.EngineeringFact &&
                    string.Equals(item.ClaimId, fact.FactId, StringComparison.Ordinal));
                return new
                {
                    candidateType = "Fact",
                    candidateId = fact.FactId,
                    application = fact.SourceApplication,
                    authority = fact.SourceAuthority.ToString(),
                    freshness = fact.Freshness.ToString(),
                    fact.CitationIds,
                    fact.EvidenceIds,
                    provenance = fact.Provenance,
                    approved = approvedFactIds.Contains(fact.FactId),
                    rejected = omission is not null,
                    decision = approvedFactIds.Contains(fact.FactId)
                        ? "approved"
                        : omission is not null ? "rejected" : "not-recorded-by-compiler",
                    reason = omission?.Reason
                };
            }).ToArray() ?? [],
            applicationDigests = applicationContext?.Participations.Select(participation =>
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    item.Kind == ContextOmissionKind.ApplicationParticipation &&
                    string.Equals(item.ClaimId, participation.CandidateId, StringComparison.Ordinal));
                return new
                {
                    candidateType = "Digest",
                    candidateId = participation.CandidateId,
                    application = participation.SourceApplication,
                    authority = participation.SourceAuthority.ToString(),
                    freshness = (string?)null,
                    observedAt = participation.Provenance.ObservedAt,
                    participation.CitationIds,
                    participation.EvidenceIds,
                    provenance = participation.Provenance,
                    approved = approvedParticipationIds.Contains(participation.CandidateId),
                    rejected = omission is not null,
                    decision = approvedParticipationIds.Contains(participation.CandidateId)
                        ? "approved"
                        : omission is not null ? "rejected" : "not-recorded-by-compiler",
                    reason = omission?.Reason
                };
            }).ToArray() ?? [],
            sourcePassages = sourceEvidence?.Passages.Select(passage =>
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    item.Kind == ContextOmissionKind.SourceEvidencePassage &&
                    string.Equals(item.ClaimId, passage.PassageId, StringComparison.Ordinal));
                return new
                {
                    candidateType = "Evidence",
                    candidateId = passage.PassageId,
                    application = passage.SourceApplication,
                    authority = (string?)null,
                    passage.Freshness,
                    passage.CitationIds,
                    passage.EvidenceIds,
                    provenance = new
                    {
                        passage.SourceRecordId,
                        passage.ProvenanceId,
                        passage.SourceRevision,
                        passage.RetrievalMethod
                    },
                    approved = approvedPassageIds.Contains(passage.PassageId),
                    rejected = omission is not null,
                    decision = approvedPassageIds.Contains(passage.PassageId)
                        ? "approved"
                        : omission is not null ? "rejected" : "not-recorded-by-compiler",
                    reason = omission?.Reason
                };
            }).ToArray() ?? []
            }
            : null;
        var applicationCandidateOutcomes = new List<(string Application, string CandidateId, bool Approved, string? Reason)>();
        if (requestContext.FullPayloadTraceEnabled)
        {
            foreach (var relationship in evidence.Relationships)
            {
                var claimId = $"relationship:{relationship.RelationshipId}";
                var omission = compilerOmissions.FirstOrDefault(item =>
                    string.Equals(item.ClaimId, claimId, StringComparison.Ordinal));
                foreach (var application in evidence.Sources
                             .Where(source => relationship.EvidenceIds.Contains(source.EvidenceId, StringComparer.Ordinal))
                             .Select(source => source.SourceSystem)
                             .Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    applicationCandidateOutcomes.Add((
                        application,
                        claimId,
                        approvedClaimIds.Contains(claimId),
                        omission?.Reason));
                }
            }
            foreach (var path in evidence.Paths)
            {
                var claimId = $"path:{path.PathId}";
                var omission = compilerOmissions.FirstOrDefault(item =>
                    string.Equals(item.ClaimId, claimId, StringComparison.Ordinal));
                var pathEvidenceIds = path.RelationshipIds
                    .SelectMany(id => evidence.Relationships
                        .Where(relationship => string.Equals(relationship.RelationshipId, id, StringComparison.Ordinal))
                        .SelectMany(relationship => relationship.EvidenceIds))
                    .ToHashSet(StringComparer.Ordinal);
                foreach (var application in evidence.Sources
                             .Where(source => pathEvidenceIds.Contains(source.EvidenceId))
                             .Select(source => source.SourceSystem)
                             .Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    applicationCandidateOutcomes.Add((
                        application,
                        claimId,
                        approvedClaimIds.Contains(claimId),
                        omission?.Reason));
                }
            }
            foreach (var chain in evidence.Chains)
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    string.Equals(item.ClaimId, chain.ChainId, StringComparison.Ordinal));
                foreach (var application in evidence.Sources
                             .Where(source => chain.SupportingEvidenceIds.Contains(source.EvidenceId, StringComparer.Ordinal))
                             .Select(source => source.SourceSystem)
                             .Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    applicationCandidateOutcomes.Add((
                        application,
                        chain.ChainId,
                        approvedClaimIds.Contains(chain.ChainId),
                        omission?.Reason));
                }
            }
            foreach (var fact in factEvidence?.Facts ?? Array.Empty<EngineeringFactEvidence>())
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    item.Kind == ContextOmissionKind.EngineeringFact &&
                    string.Equals(item.ClaimId, fact.FactId, StringComparison.Ordinal));
                applicationCandidateOutcomes.Add((
                    fact.SourceApplication,
                    fact.FactId,
                    approvedFactIds.Contains(fact.FactId),
                    omission?.Reason));
            }
            foreach (var participation in applicationContext?.Participations ?? Array.Empty<ApplicationParticipationEvidence>())
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    item.Kind == ContextOmissionKind.ApplicationParticipation &&
                    string.Equals(item.ClaimId, participation.CandidateId, StringComparison.Ordinal));
                applicationCandidateOutcomes.Add((
                    participation.SourceApplication,
                    participation.CandidateId,
                    approvedParticipationIds.Contains(participation.CandidateId),
                    omission?.Reason));
            }
            foreach (var passage in sourceEvidence?.Passages ?? Array.Empty<SourceEvidencePassage>())
            {
                var omission = compilerOmissions.FirstOrDefault(item =>
                    item.Kind == ContextOmissionKind.SourceEvidencePassage &&
                    string.Equals(item.ClaimId, passage.PassageId, StringComparison.Ordinal));
                applicationCandidateOutcomes.Add((
                    passage.SourceApplication,
                    passage.PassageId,
                    approvedPassageIds.Contains(passage.PassageId),
                    omission?.Reason));
            }
        }
        var retrievedCandidateIds = requestContext.FullPayloadTraceEnabled
            ? evidence.Relationships.Select(relationship => $"relationship:{relationship.RelationshipId}")
                .Concat(evidence.Paths.Select(path => $"path:{path.PathId}"))
                .Concat(evidence.Chains.Select(chain => chain.ChainId))
                .Concat(evidence.Sources.Select(source => source.EvidenceId))
                .Concat(factEvidence?.Facts.Select(fact => fact.FactId) ?? Array.Empty<string>())
                .Concat(applicationContext?.Participations.Select(participation => participation.CandidateId) ?? Array.Empty<string>())
                .Concat(sourceEvidence?.Passages.Select(passage => passage.PassageId) ?? Array.Empty<string>())
                .ToHashSet(StringComparer.Ordinal)
            : null;
        var contextCandidateIds = requestContext.FullPayloadTraceEnabled
            ? approvedClaimIds
                .Concat(approvedFactIds)
                .Concat(approvedParticipationIds)
                .Concat(approvedPassageIds)
                .Concat(contextPackage?.Sources.Select(source => source.EvidenceId) ?? Array.Empty<string>())
                .ToHashSet(StringComparer.Ordinal)
            : null;
        var requestedButUnobservedApplications = sourceApplicationsRequested
            .Except(candidateApplications, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        WriteTrace(
            requestContext,
            "context.compiled",
            "context-compilation",
            request.InvestigationId,
            outcome: compilation.Disposition.ToString(),
            snapshotRevision: sourceEvidence?.SnapshotRevision
                ?? factEvidence?.SnapshotRevision
                ?? applicationContext?.SnapshotRevision,
            durationMs: (long)Stopwatch.GetElapsedTime(contextCompilationStarted).TotalMilliseconds,
            input: new
            {
                graphRelationshipCount = evidence.Relationships.Count,
                graphPathCount = evidence.Paths.Count,
                graphChainCount = evidence.Chains.Count,
                graphSourceCount = evidence.Sources.Count,
                sourceEvidencePassageCount = sourceEvidence?.Passages.Count ?? 0,
                factCount = factEvidence?.Facts.Count ?? 0,
                applicationParticipationCount = applicationContext?.Participations.Count ?? 0,
                sourceApplicationsRequested,
                applicationsObservedInRetrievedCandidates = candidateApplications,
                sourceEvidenceProjectionCountsByApplication =
                    sourceEvidence?.Diagnostics?.Projection.ProjectedRecordsBySource
            },
            output: new
            {
                packageId = contextPackage?.PackageId,
                claimCount = contextPackage?.Claims.Count ?? 0,
                graphSourceCount = contextPackage?.Sources.Count ?? 0,
                sourceEvidencePassageCount = contextPackage?.SourceEvidencePassages.Count ?? 0,
                factCount = contextPackage?.EngineeringFacts.Count ?? 0,
                applicationParticipationCount = contextPackage?.ApplicationParticipation.Count ?? 0,
                applicationsIncludedInContext = contextApplications,
                applicationsObservedButAbsentFromContext = omittedApplications,
                candidateDecisionCount = compilation.CandidateDecisions.Count,
                omissionCount = compilerOmissions.Count,
                candidateDecisions,
                compilerCandidateDecisions = requestContext.FullPayloadTraceEnabled
                    ? compilation.CandidateDecisions
                    : Array.Empty<ContextCandidateDecision>(),
                omissions = requestContext.FullPayloadTraceEnabled
                    ? (object)(contextPackage?.Omissions.Select(omission => new
                    {
                        omission.Kind,
                        candidateId = omission.ClaimId,
                        omission.Reason
                    }).ToArray() ?? [])
                    : Array.Empty<object>(),
                diagnostics = requestContext.FullPayloadTraceEnabled
                    ? compilation.Diagnostics
                    : Array.Empty<string>()
            },
            diagnostics: new
            {
                applicationCoverageBasis = "Applications observed in actual retrieval results; this is not a claim about all systems configured in the investigation.",
                applicationsObservedButAbsentFromContext = requestContext.FullPayloadTraceEnabled
                    ? (object)omittedApplications
                        .Select(application =>
                        {
                            var appCandidates = applicationCandidateOutcomes
                                .Where(candidate => string.Equals(candidate.Application, application, StringComparison.OrdinalIgnoreCase))
                                .ToArray();
                            return new
                            {
                                application,
                                candidateIds = appCandidates.Select(candidate => candidate.CandidateId).ToArray(),
                                rejectionReasons = appCandidates
                                    .Where(candidate => !candidate.Approved && candidate.Reason is not null)
                                    .Select(candidate => candidate.Reason)
                                    .Distinct(StringComparer.Ordinal)
                                    .ToArray(),
                                candidatesWithoutRecordedReason = appCandidates
                                    .Where(candidate => !candidate.Approved && candidate.Reason is null)
                                    .Select(candidate => candidate.CandidateId)
                                    .ToArray()
                            };
                        }).ToArray()
                    : omittedApplications,
                requestedApplicationsWithNoObservedCandidates = requestContext.FullPayloadTraceEnabled
                    ? (object)requestedButUnobservedApplications
                        .Select(application => new
                        {
                            application,
                            reason = "The requested retrieval returned no candidates for this application."
                        }).ToArray()
                    : requestedButUnobservedApplications
            },
            fullPayload: new
            {
                retrievedGraph = evidence,
                sourceEvidence,
                factEvidence,
                applicationContext,
                compilation
            },
            itemsAdded: contextCandidateIds?.ToArray(),
            itemsRemoved: retrievedCandidateIds is null || contextCandidateIds is null
                ? []
                : retrievedCandidateIds.Except(contextCandidateIds, StringComparer.Ordinal).ToArray(),
            rejectionReasons: requestContext.FullPayloadTraceEnabled
                ? compilerOmissions.Select(omission => omission.Reason).Distinct(StringComparer.Ordinal).ToArray()
                : []);
        if (compilation.Disposition == CompilationDisposition.Denied)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Deny,
                issues: ToIssues("context-authorization-failed", compilation.Diagnostics));
        }

        if (compilation.Disposition == CompilationDisposition.ContextWindowExceeded)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                compilation.Package?.PackageId,
                ToIssues("context-candidate-exceeds-model-window", compilation.Diagnostics));
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

        var approvedPlan = compilation.ApprovedPlan;
        if (approvedPlan is null)
        {
            return CreateResult(
                request.InvestigationId,
                requestContext,
                AnswerDisposition.Failed,
                context.PackageId,
                [new ValidationIssue(
                    "approved-context-plan-unavailable",
                    "The context compiler did not provide an approved stage plan.")]);
        }
        WriteTrace(
            requestContext,
            "context.approved",
            "context-approval",
            request.InvestigationId,
            outcome: "approved",
            snapshotRevision: sourceEvidence?.SnapshotRevision
                ?? factEvidence?.SnapshotRevision
                ?? applicationContext?.SnapshotRevision,
            output: new
            {
                context.PackageId,
                stageCount = approvedPlan.Stages.Count,
                candidateIds = approvedPlan.Stages.SelectMany(stage => stage.CandidateIds).Distinct(StringComparer.Ordinal).ToArray(),
                stageSummaries = approvedPlan.Stages.Select(stage => new
                {
                    stage.Sequence,
                    candidateCount = stage.CandidateIds.Count,
                    stage.CandidateIds
                }).ToArray()
            });

        var stageCandidates = new List<AnswerCandidate>(approvedPlan.Stages.Count);
        foreach (var stage in approvedPlan.Stages)
        {
            ModelRequest modelRequest;
            var promptAssemblyStarted = Stopwatch.GetTimestamp();
            IReadOnlyList<CandidateModelDelivery> candidateDelivery = Array.Empty<CandidateModelDelivery>();
            using (var promptStage = Telemetry.StartStage(
                "prompt-assembly",
                requestContext,
                request.InvestigationId))
            {
                promptStage.SetTag("context.stage", stage.Sequence);
                try
                {
                    modelRequest = promptAssembler.Assemble(
                        request,
                        stage.Package,
                        prompt,
                        modelConfiguration,
                        requestBrief);
                    promptStage.SetDisposition("ready");
                    promptStage.SetTag("prompt.id", prompt.Id);
                    promptStage.SetTag("prompt.version", prompt.Version);
                    promptStage.SetTag("model.configuration_id", modelConfiguration.Id);
                }
                catch (Exception exception) when (
                    exception is KeyNotFoundException or InvalidDataException or ArgumentException or
                        JsonException or IOException or InvalidOperationException)
                {
                    WriteTrace(
                        requestContext,
                        "prompt.assembly.failed",
                        "prompt-assembly",
                        request.InvestigationId,
                        outcome: "failed",
                        durationMs: (long)Stopwatch.GetElapsedTime(promptAssemblyStarted).TotalMilliseconds,
                        input: new { stage.Sequence, stage.CandidateIds },
                        diagnostics: new { reasonCode = "PROMPT_ASSEMBLY_FAILED", errorType = exception.GetType().Name },
                        itemsRemoved: stage.CandidateIds);
                    promptStage.SetFailure("prompt-unavailable");
                    return CreateResult(
                        request.InvestigationId,
                        requestContext,
                        AnswerDisposition.Failed,
                        context.PackageId,
                        [new ValidationIssue("prompt-unavailable", "The approved answer prompt is unavailable.")]);
                }

                candidateDelivery = stage.CandidateIds.Select(candidateId => new CandidateModelDelivery(
                    candidateId,
                    stage.Sequence,
                    modelRequest.Messages.Any(message =>
                        message.Content.Contains(GetCandidatePayloadId(candidateId), StringComparison.Ordinal)),
                    null,
                    null,
                    null)).ToArray();
                if (!ModelInputTokenBudget.Fits(
                        modelRequest.EstimatedInputTokens,
                        modelConfiguration.MaxInputTokens,
                        modelConfiguration.MaxOutputTokens))
                {
                    WriteTrace(
                        requestContext,
                        "prompt.assembled",
                        "prompt-assembly",
                        request.InvestigationId,
                        outcome: "not-sent",
                        durationMs: (long)Stopwatch.GetElapsedTime(promptAssemblyStarted).TotalMilliseconds,
                        input: new { stage.Sequence, stage.CandidateIds },
                        output: new
                        {
                            modelRequest.EstimatedInputTokens,
                            modelConfiguration.MaxInputTokens,
                            modelConfiguration.MaxOutputTokens,
                            promptCharacters = modelRequest.Messages.Sum(message => message.Content.Length),
                            promptUtf8Bytes = modelRequest.Messages.Sum(message =>
                                Encoding.UTF8.GetByteCount(message.Content)),
                            candidateModelDelivery = candidateDelivery.Select(delivery => delivery with
                            {
                                ReachedModel = false,
                                ReasonCode = "MODEL_INPUT_BUDGET_EXCEEDED",
                                Reason = "The assembled request exceeded the configured model input window."
                            }).ToArray()
                        },
                        fullPayload: modelRequest,
                        itemsRemoved: stage.CandidateIds,
                        rejectionReasons: ["The assembled request exceeded the configured model input window."]);
                    Telemetry.RecordContextQuality(0, budgetExhausted: true);
                    promptStage.SetFailure("model-input-budget-exceeded");
                    promptStage.SetDisposition("failed");
                    return CreateResult(
                        request.InvestigationId,
                        requestContext,
                        AnswerDisposition.Failed,
                        context.PackageId,
                        [new ValidationIssue(
                            "model-input-budget-exceeded",
                            $"Approved context stage {stage.Sequence} exceeds the configured model input window.")]);
                }
                var stagePackage = stage.Package;
                var citationIds = stagePackage.Sources
                    .SelectMany(source => new[] { source.CitationId, source.ProvenanceId, source.RecordId, source.EvidenceId })
                    .Concat(stagePackage.SourceEvidencePassages.SelectMany(passage => passage.CitationIds))
                    .Concat(stagePackage.EngineeringFacts.SelectMany(fact => fact.CitationIds))
                    .Concat(stagePackage.ApplicationParticipation.SelectMany(participation => participation.CitationIds))
                    .Where(citation => !string.IsNullOrWhiteSpace(citation))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray();
                WriteTrace(
                    requestContext,
                    "prompt.assembled",
                    "prompt-assembly",
                    request.InvestigationId,
                    outcome: "ready",
                    durationMs: (long)Stopwatch.GetElapsedTime(promptAssemblyStarted).TotalMilliseconds,
                    input: new
                    {
                        stage.Sequence,
                        stage.CandidateIds,
                        stage.Package.PackageId
                    },
                    output: new
                    {
                        modelRequest.PromptBundleId,
                        modelRequest.PromptBundleVersion,
                        modelRequest.ModelConfigurationId,
                        promptCharacters = modelRequest.Messages.Sum(message => message.Content.Length),
                        promptUtf8Bytes = modelRequest.Messages.Sum(message =>
                            Encoding.UTF8.GetByteCount(message.Content)),
                        messageCount = modelRequest.Messages.Count,
                        modelRequest.EstimatedInputTokens,
                        factCount = stagePackage.EngineeringFacts.Count,
                        relationshipCount = stagePackage.Claims
                            .SelectMany(claim => claim.RelationshipIds)
                            .Distinct(StringComparer.Ordinal)
                            .Count(),
                        evidenceCount = stagePackage.Sources.Count + stagePackage.SourceEvidencePassages.Count,
                        applicationDigestCount = stagePackage.ApplicationParticipation.Count,
                        applicationsRepresented = stagePackage.Sources.Select(source => source.SourceSystem)
                            .Concat(stagePackage.SourceEvidencePassages.Select(passage => passage.SourceApplication))
                            .Concat(stagePackage.EngineeringFacts.Select(fact => fact.SourceApplication))
                            .Concat(stagePackage.ApplicationParticipation.Select(participation => participation.SourceApplication))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .Order(StringComparer.OrdinalIgnoreCase)
                            .ToArray(),
                        citationCount = citationIds.Length,
                        citationIds,
                        candidateModelDelivery = candidateDelivery
                    },
                    fullPayload: modelRequest,
                    itemsAdded: stage.CandidateIds);
            }

            ModelResponse modelResponse;
            var modelInvocationStarted = Stopwatch.GetTimestamp();
            WriteTrace(
                requestContext,
                "model.invocation.started",
                "model-invocation",
                request.InvestigationId,
                outcome: "started",
                input: new
                {
                    modelConfiguration.Provider,
                    modelConfiguration.DeploymentName,
                    modelConfiguration.Id,
                    stage.Sequence,
                    stageCount = approvedPlan.Stages.Count,
                    modelRequest.EstimatedInputTokens
                });
            using (var modelStage = Telemetry.StartStage(
                "model-generation",
                requestContext,
                request.InvestigationId))
            {
                modelStage.SetTag("context.stage", stage.Sequence);
                modelStage.SetTag("context.stage_candidate_count", stage.CandidateIds.Count);
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
                    WriteTrace(
                        requestContext,
                        "model.response",
                        "model-invocation",
                        request.InvestigationId,
                        outcome: "completed",
                        durationMs: (long)Stopwatch.GetElapsedTime(modelInvocationStarted).TotalMilliseconds,
                        input: new
                        {
                            stage.Sequence,
                            modelRequest.EstimatedInputTokens
                        },
                        output: new
                        {
                            modelResponse.Provider,
                            modelResponse.Model,
                            modelResponse.ModelVersion,
                            modelResponse.InputTokens,
                            modelResponse.OutputTokens,
                            latencyMs = (long)modelResponse.Duration.TotalMilliseconds,
                            gatewayInvocationCount = 1,
                            providerSdkRetries = "not exposed by IModelGateway",
                            responseCharacters = modelResponse.Content.Length,
                            candidateModelDelivery = candidateDelivery.Select(delivery => delivery with
                            {
                                ReachedModel = true
                            }).ToArray()
                        },
                        fullPayload: new { modelResponse.Content });
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    WriteTrace(
                        requestContext,
                        "model.invocation.cancelled",
                        "model-invocation",
                        request.InvestigationId,
                        outcome: "cancelled",
                        output: new
                        {
                            candidateModelDelivery = candidateDelivery.Select(delivery => delivery with
                            {
                                ReachedModel = null,
                                ReasonCode = "REQUEST_CANCELLED",
                                Reason = "The provider call was cancelled without a response, so remote receipt is unknown."
                            }).ToArray()
                        });
                    modelStage.SetFailure("other");
                    modelStage.SetDisposition("cancelled");
                    throw;
                }
                catch (OperationCanceledException)
                {
                    WriteTrace(
                        requestContext,
                        "model.invocation.failed",
                        "model-invocation",
                        request.InvestigationId,
                        outcome: "timeout",
                        durationMs: (long)Stopwatch.GetElapsedTime(modelInvocationStarted).TotalMilliseconds,
                        output: new
                        {
                            candidateModelDelivery = candidateDelivery.Select(delivery => delivery with
                            {
                                ReachedModel = null,
                                ReasonCode = "MODEL_PROVIDER_TIMEOUT",
                                Reason = "The provider call timed out; remote receipt is unknown."
                            }).ToArray()
                        },
                        diagnostics: new
                        {
                            reasonCode = "MODEL_PROVIDER_TIMEOUT",
                            gatewayInvocationCount = 1,
                            providerSdkRetries = "not exposed by IModelGateway"
                        });
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
                    WriteTrace(
                        requestContext,
                        "model.invocation.failed",
                        "model-invocation",
                        request.InvestigationId,
                        outcome: "failed",
                        durationMs: (long)Stopwatch.GetElapsedTime(modelInvocationStarted).TotalMilliseconds,
                        diagnostics: new
                        {
                            reasonCode = "MODEL_PROVIDER_FAILED",
                            errorType = exception.GetType().Name,
                            providerErrorStatusCode = exception is HttpRequestException httpException
                                ? httpException.StatusCode?.ToString()
                                : null,
                            gatewayInvocationCount = 1,
                            providerSdkRetries = "not exposed by IModelGateway"
                        },
                        output: new
                        {
                            candidateModelDelivery = candidateDelivery.Select(delivery => delivery with
                            {
                                ReachedModel = null,
                                ReasonCode = "MODEL_PROVIDER_FAILED",
                                Reason = "The provider call failed; remote receipt is unknown."
                            }).ToArray()
                        });
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
                        [new ValidationIssue(
                            "model-response-correlation-mismatch",
                            "The model response belongs to another request.")]);
                }
            }

            try
            {
                stageCandidates.Add(answerCandidateParser.Parse(modelResponse.Content));
            }
            catch (JsonException)
            {
                WriteTrace(
                    requestContext,
                    "model.output.parse-failed",
                    "answer-parsing",
                    request.InvestigationId,
                    outcome: "failed",
                    diagnostics: new { reasonCode = "MODEL_OUTPUT_SCHEMA_INVALID", stage.Sequence });
                Telemetry.RecordValidationDisposition("failed");
                return CreateResult(
                    request.InvestigationId,
                    requestContext,
                    AnswerDisposition.Failed,
                    context.PackageId,
                    [new ValidationIssue(
                        "invalid-model-output",
                        $"The model response for context stage {stage.Sequence} did not match the required answer schema.")]);
            }
        }

        var candidate = new AnswerCandidate(
            string.Join(Environment.NewLine, stageCandidates.Select(stageCandidate => stageCandidate.Summary)),
            Array.AsReadOnly(stageCandidates.SelectMany(stageCandidate => stageCandidate.Impacts).ToArray()),
            Array.AsReadOnly(stageCandidates.SelectMany(stageCandidate => stageCandidate.Warnings).ToArray()))
        {
            Facts = Array.AsReadOnly(stageCandidates.SelectMany(stageCandidate => stageCandidate.Facts).ToArray()),
            ApplicationContexts = Array.AsReadOnly(
                stageCandidates.SelectMany(stageCandidate => stageCandidate.ApplicationContexts).ToArray()),
            SourceEvidence = Array.AsReadOnly(
                stageCandidates.SelectMany(stageCandidate => stageCandidate.SourceEvidence).ToArray())
        };
        ValidationResult validation;
        var validationStarted = Stopwatch.GetTimestamp();
        using (var validationStage = Telemetry.StartStage(
            "validation",
            requestContext,
            request.InvestigationId))
        {
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

        WriteTrace(
            requestContext,
            "answer.validation.completed",
            "answer-validation",
            request.InvestigationId,
            outcome: validation.Disposition.ToString(),
            durationMs: (long)Stopwatch.GetElapsedTime(validationStarted).TotalMilliseconds,
            output: new
            {
                validation.Disposition,
                assertions = validation.AssertionOutcomes,
                validation.Issues
            },
            fullPayload: new { candidate, validation });

        var finalResult = validation.Disposition switch
        {
            ValidationDisposition.Accept => CreateAcceptedResult(
                request.InvestigationId,
                requestContext,
                context,
                candidate,
                validation.Issues,
                subject,
                plannedScope.Scope,
                evidence,
                authorization.Scope,
                turnInterpretation,
                priorConversationState,
                conversationStateLifetime),
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
        var requestedCitationIds = candidate.Impacts.SelectMany(impact => impact.SourceIds)
            .Concat(candidate.Facts.SelectMany(fact => fact.SourceIds))
            .Concat(candidate.ApplicationContexts.SelectMany(application => application.SourceIds))
            .Concat(candidate.SourceEvidence.SelectMany(passage => passage.SourceIds))
            .Distinct(StringComparer.Ordinal)
            .ToHashSet(StringComparer.Ordinal);
        var resolvedCitationIds = finalResult.Sources
            .SelectMany(GetSourceIds)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .ToHashSet(StringComparer.Ordinal);
        WriteTrace(
            requestContext,
            "citation.resolution.completed",
            "citation-resolution",
            request.InvestigationId,
            outcome: validation.Disposition == ValidationDisposition.Accept ? "completed" : "not-run",
            output: new
            {
                requestedCitationIds = requestedCitationIds.Order(StringComparer.Ordinal).ToArray(),
                resolvedCitationIds = resolvedCitationIds.Order(StringComparer.Ordinal).ToArray(),
                unresolvedCitationIds = requestedCitationIds.Except(resolvedCitationIds, StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray(),
                resolvedSourceCount = finalResult.Sources.Count
            },
            fullPayload: finalResult.Sources);
        WriteTrace(
            requestContext,
            "request.completed",
            "runtime",
            request.InvestigationId,
            outcome: finalResult.Disposition.ToString(),
            output: new
            {
                finalResult.ContextPackageId,
                finalResult.Disposition,
                summaryCharacters = finalResult.Summary?.Length ?? 0,
                impactCount = finalResult.Impacts.Count,
                factCount = finalResult.Facts.Count,
                applicationDigestCount = finalResult.ApplicationContexts.Count,
                sourceEvidenceCount = finalResult.SourceEvidence.Count,
                sourceCount = finalResult.Sources.Count,
                issueCount = finalResult.Issues.Count
            },
            fullPayload: finalResult);
        return finalResult;
    }

    private async Task<string?> GenerateRequestBriefAsync(
        ImpactAnswerRequest request,
        RuntimeRequestContext requestContext,
        CancellationToken cancellationToken)
    {
        var conversationHistory = request.ConversationHistory ?? Array.Empty<ConversationHistoryTurn>();
        var messages = new List<ModelMessage>
        {
            new("system", RequestBriefInstructions)
        };
        foreach (var turn in conversationHistory)
        {
            if (turn is null)
            {
                continue;
            }
            messages.Add(new ModelMessage("user", turn.UserMessage ?? string.Empty));
            messages.Add(new ModelMessage("assistant", turn.AssistantMessage ?? string.Empty));
        }
        messages.Add(new ModelMessage(
            "user",
            JsonSerializer.Serialize(new { question = request.Question })));

        var readonlyMessages = Array.AsReadOnly(messages.ToArray());
        var modelRequest = new ModelRequest(
            requestContext,
            RequestBriefPromptId,
            RequestBriefPromptVersion,
            $"request-brief-{requestContext.RequestId}",
            modelConfiguration.Id,
            readonlyMessages,
            RequestBriefOutputSchemaVersion)
        {
            EstimatedInputTokens = ModelInputTokenBudget.EstimateInputTokens(
                readonlyMessages,
                modelConfiguration.TokenizerModelName)
        };
        var started = Stopwatch.GetTimestamp();
        using var stage = Telemetry.StartStage(
            "request-brief",
            requestContext,
            request.InvestigationId);
        stage.SetTag("prompt.id", RequestBriefPromptId);
        stage.SetTag("prompt.version", RequestBriefPromptVersion);
        stage.SetTag("model.configuration_id", modelConfiguration.Id);
        try
        {
            var response = await modelGateway.GenerateAsync(modelRequest, cancellationToken)
                .ConfigureAwait(false);
            Telemetry.RecordModelUsage(
                modelConfiguration.Provider,
                modelConfiguration.Id,
                response.InputTokens,
                response.OutputTokens);
            stage.SetDisposition("completed");
            WriteTrace(
                requestContext,
                "request-brief.completed",
                "request-brief",
                request.InvestigationId,
                outcome: "completed",
                durationMs: (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds,
                input: new
                {
                    questionCharacters = request.Question.Length,
                    conversationTurnCount = conversationHistory.Count,
                    modelRequest.EstimatedInputTokens
                },
                output: new
                {
                    response.Provider,
                    response.Model,
                    response.InputTokens,
                    response.OutputTokens,
                    briefCharacters = response.Content?.Length ?? 0
                });
            return string.IsNullOrWhiteSpace(response.Content) ? null : response.Content;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            stage.SetFailure("other");
            stage.SetDisposition("cancelled");
            WriteTrace(
                requestContext,
                "request-brief.cancelled",
                "request-brief",
                request.InvestigationId,
                outcome: "cancelled",
                durationMs: (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            throw;
        }
        catch (OperationCanceledException)
        {
            stage.SetFailure("request-brief-timeout");
            stage.SetDisposition("unavailable");
            WriteTrace(
                requestContext,
                "request-brief.unavailable",
                "request-brief",
                request.InvestigationId,
                outcome: "timeout",
                durationMs: (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds,
                diagnostics: new { reasonCode = "REQUEST_BRIEF_TIMEOUT" });
            return null;
        }
        catch (Exception exception) when (
            exception is HttpRequestException or TimeoutException or InvalidOperationException or ArgumentException)
        {
            stage.SetFailure("request-brief-unavailable");
            stage.SetDisposition("unavailable");
            WriteTrace(
                requestContext,
                "request-brief.unavailable",
                "request-brief",
                request.InvestigationId,
                outcome: "failed",
                durationMs: (long)Stopwatch.GetElapsedTime(started).TotalMilliseconds,
                diagnostics: new
                {
                    reasonCode = "REQUEST_BRIEF_UNAVAILABLE",
                    errorType = exception.GetType().Name
                });
            return null;
        }
    }

    private static bool RequestsSingleFactPerApplication(string question)
    {
        var asksForOneFact =
            question.Contains("one concrete fact", StringComparison.OrdinalIgnoreCase) ||
            question.Contains("one fact", StringComparison.OrdinalIgnoreCase) ||
            question.Contains("1 concrete fact", StringComparison.OrdinalIgnoreCase) ||
            question.Contains("1 fact", StringComparison.OrdinalIgnoreCase);
        var asksForEachSource =
            question.Contains("for each", StringComparison.OrdinalIgnoreCase) ||
            question.Contains("per application", StringComparison.OrdinalIgnoreCase) ||
            question.Contains("per source", StringComparison.OrdinalIgnoreCase);
        return asksForOneFact && asksForEachSource;
    }

    private void WriteTrace(
        RuntimeRequestContext requestContext,
        string eventName,
        string stage,
        string? investigationId,
        int? snapshotRevision = null,
        string? outcome = null,
        long? durationMs = null,
        object? input = null,
        object? output = null,
        object? fullPayload = null,
        object? diagnostics = null,
        IReadOnlyList<string>? itemsAdded = null,
        IReadOnlyList<string>? itemsRemoved = null,
        IReadOnlyList<string>? rejectionReasons = null)
    {
        if (ExecutionTrace is null)
        {
            return;
        }

        try
        {
            ExecutionTrace.Write(CopilotExecutionTraceEventFactory.Create(
                requestContext,
                eventName,
                stage,
                investigationId,
                snapshotRevision,
                outcome,
                durationMs,
                input,
                output,
                fullPayload,
                diagnostics,
                itemsAdded: itemsAdded,
                itemsRemoved: itemsRemoved,
                rejectionReasons: rejectionReasons));
        }
        catch
        {
            // Trace serialization and sinks must never change answer execution.
        }
    }

    private static string GetCandidatePayloadId(string candidateId)
    {
        var prefixSeparator = candidateId.IndexOf(':');
        return prefixSeparator < 0 ? candidateId : candidateId[(prefixSeparator + 1)..];
    }

    private sealed record CandidateModelDelivery(
        string CandidateId,
        int AssignedStage,
        bool Rendered,
        bool? ReachedModel,
        string? ReasonCode,
        string? Reason);

    private static ValidationIssue CreateFollowUpIssue(ConversationTurnInterpretation interpretation)
    {
        if (interpretation.IsAmbiguous)
        {
            return new ValidationIssue(
                "multiple-validated-subjects",
                "Several validated engineering items could match this follow-up. Please identify which item you mean.");
        }

        if (interpretation.ReasonCodes.Contains("no-eligible-prior-answer-state", StringComparer.Ordinal) ||
            interpretation.ReasonCodes.Contains("no-validated-subject-reference", StringComparer.Ordinal))
        {
            return new ValidationIssue(
                "validated-subject-required",
                "I could not connect this follow-up to a validated subject from the previous runtime answer. Please identify the engineering item.");
        }

        if (interpretation.FilterDelta.RequestedTargetApplications is { Count: > 0 } applications)
        {
            return new ValidationIssue(
                "target-application-filter-not-supported",
                $"I recognized the requested {string.Join(", ", applications)} target-application filter, but the PLM target-application contract is not confirmed. I did not generate an unfiltered answer.");
        }

        if (interpretation.ReasonCodes.Contains(
                "criticality-requires-governed-definition",
                StringComparer.Ordinal))
        {
            return new ValidationIssue(
                "criticality-requires-governed-definition",
                "I need a governed criticality field and approved definition before I can identify critical impacts.");
        }

        if (interpretation.ReasonCodes.Contains(
                "filter-term-requires-current-ontology-validation",
                StringComparer.Ordinal))
        {
            return new ValidationIssue(
                "filter-term-requires-ontology-validation",
                "The requested relationship filter must be matched to the current authorized ontology before I can apply it.");
        }

        return new ValidationIssue(
            "conversation-follow-up-not-supported",
            "I recognized this as a conversation follow-up, but its runtime operation is not yet available.");
    }

    private static bool CanResolveAsFreshImpactTurn(ConversationTurnInterpretation interpretation)
    {
        var applicationContextFilter = interpretation.Type == ConversationTurnType.FollowUpFilter &&
            (interpretation.FilterDelta.RequestedSourceApplications is { Count: > 0 } ||
             interpretation.FilterDelta.RequestedTargetApplications is { Count: > 0 }) &&
            interpretation.FilterDelta.RequestedRelationshipTerms is not { Count: > 0 } &&
            interpretation.FilterDelta.MaxHops is null &&
            interpretation.FilterDelta.AsOf is null;
        var reusableImpactTurn = interpretation.Type is ConversationTurnType.FollowUpExpansion
            or ConversationTurnType.FollowUpExplanation
            or ConversationTurnType.ClarificationResponse;

        return (reusableImpactTurn || applicationContextFilter) &&
        !interpretation.ClarificationRequired &&
        !interpretation.IsAmbiguous &&
        interpretation.ReferenceCandidateIds.Count == 1 &&
        (applicationContextFilter ||
         interpretation.FilterDelta.RequestedSourceApplications is not { Count: > 0 } &&
         interpretation.FilterDelta.RequestedTargetApplications is not { Count: > 0 }) &&
        interpretation.FilterDelta.RequestedRelationshipTerms is not { Count: > 0 } &&
        interpretation.FilterDelta.MaxHops is null &&
        interpretation.FilterDelta.AsOf is null;
    }

    private static bool IsBoundToRequest(
        FactEvidenceRetrievalResult? result,
        FactEvidenceQuery query) =>
        result is not null &&
        result.SnapshotRevision >= 0 &&
        result.Facts is not null &&
        string.Equals(result.InvestigationId, query.InvestigationId, StringComparison.Ordinal) &&
        string.Equals(result.SourceVersion, query.SourceVersion, StringComparison.Ordinal) &&
        string.Equals(result.OntologyVersion, query.OntologyVersion, StringComparison.Ordinal) &&
        string.Equals(
            result.AuthorizationDecisionId,
            query.Authorization.Scope.DecisionId,
            StringComparison.Ordinal) &&
        string.Equals(result.RequestId, query.RequestContext.RequestId, StringComparison.Ordinal) &&
        string.Equals(result.TraceId, query.RequestContext.TraceId, StringComparison.Ordinal);

    private static bool IsBoundToRequest(
        ApplicationContextRetrievalResult? result,
        ApplicationContextQuery query) =>
        result is not null &&
        result.SnapshotRevision >= 0 &&
        result.Participations is not null &&
        string.Equals(result.InvestigationId, query.InvestigationId, StringComparison.Ordinal) &&
        string.Equals(result.SourceVersion, query.SourceVersion, StringComparison.Ordinal) &&
        string.Equals(result.OntologyVersion, query.OntologyVersion, StringComparison.Ordinal) &&
        string.Equals(
            result.AuthorizationDecisionId,
            query.Authorization.Scope.DecisionId,
            StringComparison.Ordinal) &&
        string.Equals(result.RequestId, query.RequestContext.RequestId, StringComparison.Ordinal) &&
        string.Equals(result.TraceId, query.RequestContext.TraceId, StringComparison.Ordinal);

    private bool HasRequiredAuthorization(AuthorizationContext authorization)
    {
        var scope = authorization.Scope;
        return authorization.ExpiresAt > (timeProvider ?? TimeProvider.System).GetUtcNow() &&
               scope.DecisionExpiresAt > (timeProvider ?? TimeProvider.System).GetUtcNow() &&
               scope.Grants.Contains(ResolveEntityGrant) &&
               scope.Grants.Contains(ReadImpactEvidenceGrant);
    }

    private ConversationStateInvalidationReason? GetConversationStateInvalidationReason(
        ConversationState? state,
        ImpactAnswerRequest request,
        RuntimeRequestContext requestContext,
        AuthorizationContext authorization)
    {
        if (state is null) return null;
        if (state.SchemaVersion != 1 || state.StateVersion < 1 ||
            state.LastTurnDisposition is not (ConversationTurnDisposition.Answer or ConversationTurnDisposition.Clarify))
        {
            return ConversationStateInvalidationReason.UnsupportedDisposition;
        }
        if (!string.Equals(
                state.OwnerFingerprint,
                ConversationStateOwnerFingerprint.Create(authorization.Scope),
                StringComparison.Ordinal))
        {
            return ConversationStateInvalidationReason.OwnerMismatch;
        }
        if (!string.Equals(state.InvestigationId, request.InvestigationId, StringComparison.Ordinal))
        {
            return ConversationStateInvalidationReason.InvestigationMismatch;
        }
        if (!string.Equals(
                state.ConversationId,
                request.ConversationId ?? requestContext.ConversationId,
                StringComparison.Ordinal))
        {
            return ConversationStateInvalidationReason.ConversationMismatch;
        }
        if (!string.Equals(state.PreviousTurnId, request.ParentTurnId, StringComparison.Ordinal))
        {
            return ConversationStateInvalidationReason.ParentTurnMismatch;
        }
        if (state.ExpiresAt <= (timeProvider ?? TimeProvider.System).GetUtcNow())
        {
            return ConversationStateInvalidationReason.Expired;
        }

        return null;
    }

    private ImpactAnswerResult CreateAcceptedResult(
        string investigationId,
        RuntimeRequestContext requestContext,
        ContextPackage context,
        AnswerCandidate candidate,
        IReadOnlyList<ValidationIssue> issues,
        ResolvedEntity? subject,
        ImpactScope scope,
        EvidenceRetrievalResult evidence,
        AuthorizationScope authorization,
        ConversationTurnInterpretation turnInterpretation,
        ConversationState? priorState,
        TimeSpan? conversationStateLifetime)
    {
        var referencedEvidenceIds = candidate.Impacts
            .SelectMany(impact => impact.EvidenceIds)
            .Concat(candidate.SourceEvidence.SelectMany(assertion => assertion.EvidenceIds))
            .ToHashSet(StringComparer.Ordinal);
        var referencedSourceIds = candidate.Impacts
            .SelectMany(impact => impact.SourceIds)
            .Concat(candidate.SourceEvidence.SelectMany(assertion => assertion.SourceIds))
            .ToHashSet(StringComparer.Ordinal);
        var factById = context.EngineeringFacts
            .Where(fact => !string.IsNullOrWhiteSpace(fact.FactId))
            .ToDictionary(fact => fact.FactId, StringComparer.Ordinal);
        var participationById = context.ApplicationParticipation
            .Where(participation => !string.IsNullOrWhiteSpace(participation.CandidateId))
            .ToDictionary(participation => participation.CandidateId, StringComparer.Ordinal);
        var sources = context.Sources
            .Where(source => referencedEvidenceIds.Contains(source.EvidenceId) &&
                             GetSourceIds(source).Any(referencedSourceIds.Contains))
            .Concat(context.SourceEvidencePassages
                .Where(passage => referencedSourceIds.Contains(passage.PassageId))
                .Select(passage => new EvidenceSourceReference(
                    passage.PassageId,
                    "source-evidence-passage",
                    passage.SourceApplication,
                    passage.SourceRecordId,
                    passage.SourceRevision,
                    passage.Location,
                    passage.DeepLink,
                    passage.ProvenanceId,
                    passage.AuthorizationDecisionId,
                    CitationId: passage.PassageId,
                    Authority: passage.SourceApplication,
                    Provider: passage.SourceApplication)))
            .Concat(candidate.Facts
                .Where(assertion => factById.ContainsKey(assertion.FactId))
                .SelectMany(assertion =>
                {
                    var fact = factById[assertion.FactId];
                    return assertion.EvidenceIds
                        .Intersect(fact.EvidenceIds, StringComparer.Ordinal)
                        .SelectMany(evidenceId => assertion.SourceIds
                            .Intersect(fact.CitationIds, StringComparer.Ordinal)
                            .Select(sourceId => new EvidenceSourceReference(
                                evidenceId,
                                "engineering-fact",
                                fact.SourceApplication,
                                fact.SourceNativeId ?? fact.SourceEntityId,
                                fact.Provenance.NativeRevision,
                                fact.SourceFieldName,
                                null,
                                fact.Provenance.SourceExecutionId ??
                                    fact.Provenance.ArtifactReference ?? fact.Provenance.NativeId!,
                                fact.AuthorizationDecisionId,
                                CitationId: sourceId,
                                Authority: fact.SourceAuthority.ToString(),
                                Provider: fact.Provenance.Provider,
                                ObservedAt: fact.Provenance.ObservedAt)));
                }))
            .Concat(candidate.ApplicationContexts
                .Where(assertion => participationById.ContainsKey(assertion.CandidateId))
                .SelectMany(assertion =>
                {
                    var participation = participationById[assertion.CandidateId];
                    return assertion.EvidenceIds
                        .Intersect(participation.EvidenceIds, StringComparer.Ordinal)
                        .SelectMany(evidenceId => assertion.SourceIds
                            .Intersect(participation.CitationIds, StringComparer.Ordinal)
                            .Select(sourceId => new EvidenceSourceReference(
                                evidenceId,
                                "application-participation",
                                participation.SourceApplication,
                                participation.Provenance.NativeId ?? assertion.CandidateId,
                                participation.Provenance.NativeRevision,
                                participation.SourceOperation,
                                null,
                                participation.Provenance.SourceExecutionId ??
                                    participation.Provenance.ArtifactReference ?? participation.Provenance.NativeId!,
                                participation.AuthorizationDecisionId,
                                CitationId: sourceId,
                                Authority: participation.SourceAuthority.ToString(),
                                Provider: participation.Provenance.Provider,
                                ObservedAt: participation.Provenance.ObservedAt)));
                }))
            .Distinct()
            .ToArray();

        var result = new ImpactAnswerResult(
            investigationId,
            requestContext,
            AnswerDisposition.Answer,
            candidate.Summary,
            candidate.Impacts,
            sources,
            issues,
            context.PackageId)
        {
            Facts = candidate.Facts,
            ApplicationContexts = candidate.ApplicationContexts,
            SourceEvidence = candidate.SourceEvidence
        };
        var conversationId = requestContext.ConversationId;
        var turnId = requestContext.TurnId;
        if (conversationStateLifetime is not { } lifetime ||
            string.IsNullOrWhiteSpace(conversationId) ||
            string.IsNullOrWhiteSpace(turnId))
        {
            return result;
        }

        var now = (timeProvider ?? TimeProvider.System).GetUtcNow();
        return result with
        {
            ContinuationState = new ConversationState(
                1,
                conversationId,
                investigationId,
                (priorState?.StateVersion ?? 0) + 1,
                subject is null ? Array.Empty<string>() : [subject.CanonicalId],
                subject is null
                    ? Array.Empty<ValidatedEntityReference>()
                    : [new ValidatedEntityReference(subject.CanonicalId, subject.EntityType, subject.System)],
                new ConversationApplicationFilters([], []),
                [],
                scope,
                turnInterpretation.OutputDimension ?? ConversationOutputDimension.Impact,
                turnId,
                context.PackageId,
                null,
                evidence.SourceVersion,
                evidence.OntologyVersion,
                ConversationStateOwnerFingerprint.Create(authorization),
                null,
                ConversationTurnDisposition.Answer,
                priorState?.CreatedAt ?? now,
                now,
                now.Add(lifetime))
        };
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

    private static EvidenceRetrievalResult EmptyEvidenceAfterRetrievalFailure(
        string investigationId,
        AuthorizationContext authorization,
        RuntimeRequestContext requestContext) =>
        new(
            investigationId,
            [],
            [],
            [],
            [],
            string.Empty,
            string.Empty,
            authorization.Scope.DecisionId,
            requestContext.RequestId,
            requestContext.TraceId);

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
