using System.Text.Json;
using System.Text.Json.Serialization;
using Lattice.AI.Runtime.Contracts.Answers;
using Lattice.AI.Runtime.Prompts;

namespace Lattice.AI.Runtime.Evaluation.PromptExperiments;

public sealed class FewShotPromptEvaluationDatasetReader
{
    private const string DatasetSchemaVersion = "few-shot-evaluation/v1";
    private const string DatasetId = "lattice-few-shot-prompt-synthetic-v1";
    private const string DatasetVersion = "v1";
    private const string Classification = "synthetic-fixture-only";
    private const int MaximumDatasetBytes = 2 * 1024 * 1024;
    private const int MaximumManifestBytes = 32 * 1024;
    private const int MaximumLineBytes = 256 * 1024;
    private const int MaximumCaseCount = 100;
    private static readonly string[] RequiredScenarioTags =
    [
        "direct-impact",
        "why-follow-up",
        "source-evidence-explanation",
        "abstention",
        "clarification",
        "valid-reference",
        "uncertainty",
        "stale-assistant-claim",
        "prompt-injection"
    ];
    private static readonly HashSet<string> SupportedScenarioTags =
        RequiredScenarioTags.ToHashSet(StringComparer.Ordinal);
    private static readonly JsonSerializerOptions CaseJsonOptions = CreateCaseJsonOptions();

    public FewShotPromptEvaluationDataset Read(string datasetPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(datasetPath);
        var root = Path.GetFullPath(datasetPath);
        if (!Directory.Exists(root))
        {
            throw new DirectoryNotFoundException($"Prompt evaluation dataset directory '{root}' does not exist.");
        }

        var manifestPath = ResolveDatasetFile(root, "manifest.json", "manifest.json");
        var manifest = ReadManifest(manifestPath);
        var casesPath = ResolveDatasetFile(root, manifest.CasesFile, "manifest casesFile");
        var cases = ReadCases(casesPath, manifest.CaseCount);
        ValidateCoverage(cases, manifest.RequiredScenarioTags);

        return new FewShotPromptEvaluationDataset(
            manifest.Id,
            manifest.Version,
            manifest.Classification,
            Array.AsReadOnly(manifest.RequiredScenarioTags),
            Array.AsReadOnly(cases.ToArray()));
    }

    private static DatasetManifest ReadManifest(string manifestPath)
    {
        var manifestInfo = new FileInfo(manifestPath);
        if (manifestInfo.Length is <= 0 or > MaximumManifestBytes)
        {
            throw new InvalidDataException("The prompt evaluation manifest is empty or too large.");
        }

        try
        {
            using var document = JsonDocument.Parse(
                File.ReadAllText(manifestPath),
                new JsonDocumentOptions { MaxDepth = 16, AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow });
            var manifest = document.RootElement;
            EnsureNoDuplicateProperties(manifest);
            EnsureExactProperties(
                manifest,
                "schemaVersion",
                "datasetId",
                "version",
                "classification",
                "caseCount",
                "casesFile",
                "requiredScenarioTags");

            var schemaVersion = RequiredString(manifest, "schemaVersion");
            var id = RequiredString(manifest, "datasetId");
            var version = RequiredString(manifest, "version");
            var classification = RequiredString(manifest, "classification");
            var casesFile = RequiredString(manifest, "casesFile");
            var caseCount = RequiredInt32(manifest, "caseCount");
            var requiredScenarioTags = ReadStringArray(manifest, "requiredScenarioTags");

            if (schemaVersion != DatasetSchemaVersion ||
                id != DatasetId ||
                version != DatasetVersion ||
                classification != Classification ||
                casesFile != "cases.jsonl" ||
                caseCount is <= 0 or > MaximumCaseCount ||
                !requiredScenarioTags.SequenceEqual(RequiredScenarioTags, StringComparer.Ordinal))
            {
                throw new InvalidDataException("The prompt evaluation manifest does not match the supported dataset contract.");
            }

            return new DatasetManifest(id, version, classification, caseCount, casesFile, requiredScenarioTags);
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("The prompt evaluation manifest contains invalid JSON.", exception);
        }
    }

    private static List<FewShotPromptEvaluationCase> ReadCases(string casesPath, int expectedCaseCount)
    {
        var casesInfo = new FileInfo(casesPath);
        if (casesInfo.Length is <= 0 or > MaximumDatasetBytes)
        {
            throw new InvalidDataException("The prompt evaluation cases file is empty or too large.");
        }

        var cases = new List<FewShotPromptEvaluationCase>();
        var caseIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var line in File.ReadLines(casesPath))
        {
            if (string.IsNullOrWhiteSpace(line) ||
                System.Text.Encoding.UTF8.GetByteCount(line) > MaximumLineBytes)
            {
                throw new InvalidDataException("Prompt evaluation cases must be non-empty JSON lines within the supported size.");
            }

            try
            {
                using var document = JsonDocument.Parse(
                    line,
                    new JsonDocumentOptions { MaxDepth = 32, AllowTrailingCommas = false, CommentHandling = JsonCommentHandling.Disallow });
                EnsureNoDuplicateProperties(document.RootElement);
                var evaluationCase = JsonSerializer.Deserialize<FewShotPromptEvaluationCase>(
                    line,
                    CaseJsonOptions);
                if (evaluationCase is null)
                {
                    throw new InvalidDataException("A prompt evaluation case cannot be null.");
                }

                ValidateCase(evaluationCase);
                if (!caseIds.Add(evaluationCase.CaseId))
                {
                    throw new InvalidDataException($"Prompt evaluation case ID '{evaluationCase.CaseId}' is duplicated.");
                }

                cases.Add(evaluationCase);
                if (cases.Count > MaximumCaseCount)
                {
                    throw new InvalidDataException($"Prompt evaluation datasets cannot contain more than {MaximumCaseCount} cases.");
                }
            }
            catch (JsonException exception)
            {
                throw new InvalidDataException("A prompt evaluation case contains invalid or unsupported JSON.", exception);
            }
        }

        if (cases.Count != expectedCaseCount)
        {
            throw new InvalidDataException(
                $"The prompt evaluation manifest declares {expectedCaseCount} cases, but {cases.Count} were loaded.");
        }

        return cases;
    }

    private static void ValidateCase(FewShotPromptEvaluationCase evaluationCase)
    {
        if (string.IsNullOrWhiteSpace(evaluationCase.CaseId) ||
            !evaluationCase.CaseId.StartsWith("SYNTH-CASE-", StringComparison.Ordinal) ||
            !Enum.IsDefined(evaluationCase.Intent) ||
            !Enum.IsDefined(evaluationCase.ExpectedDisposition) ||
            evaluationCase.ScenarioTags is null ||
            evaluationCase.ScenarioTags.Count == 0 ||
            evaluationCase.Request is null ||
            evaluationCase.Context is null ||
            evaluationCase.ExpectedClaimIds is null ||
            evaluationCase.ExpectedEvidenceIds is null ||
            evaluationCase.ExpectedSourceIds is null)
        {
            throw new InvalidDataException("A prompt evaluation case is missing required synthetic fields.");
        }

        EnsureUniqueSupportedTags(evaluationCase.ScenarioTags);
        EnsureSyntheticRequestAndContext(evaluationCase);
        EnsureExpectedReferences(evaluationCase);
        EnsureDispositionMatchesGeneration(evaluationCase);
    }

    private static void EnsureUniqueSupportedTags(IReadOnlyList<string> scenarioTags)
    {
        if (scenarioTags.Any(tag => string.IsNullOrWhiteSpace(tag) || !SupportedScenarioTags.Contains(tag)) ||
            scenarioTags.Distinct(StringComparer.Ordinal).Count() != scenarioTags.Count)
        {
            throw new InvalidDataException("A prompt evaluation case has unknown or duplicate scenario tags.");
        }
    }

    private static void EnsureSyntheticRequestAndContext(FewShotPromptEvaluationCase evaluationCase)
    {
        var request = evaluationCase.Request;
        var context = evaluationCase.Context;
        var requestContext = context.RequestContext;
        var subject = context.Subject;
        if (string.IsNullOrWhiteSpace(request.InvestigationId) ||
            !request.InvestigationId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(request.Question) ||
            string.IsNullOrWhiteSpace(context.InvestigationId) ||
            !string.Equals(request.InvestigationId, context.InvestigationId, StringComparison.Ordinal) ||
            !context.InvestigationId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(context.PackageId) ||
            !context.PackageId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(context.AuthorizationDecisionId) ||
            !context.AuthorizationDecisionId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            requestContext is null ||
            string.IsNullOrWhiteSpace(requestContext.RequestId) ||
            !requestContext.RequestId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(requestContext.TraceId) ||
            !requestContext.TraceId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            subject is null ||
            string.IsNullOrWhiteSpace(subject.CanonicalId) ||
            !subject.CanonicalId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
            context.Scope is null ||
            request.ConversationHistory is null ||
            context.Claims is null ||
            context.Sources is null ||
            context.Omissions is null)
        {
            throw new InvalidDataException($"Prompt evaluation case '{evaluationCase.CaseId}' contains a non-synthetic or incomplete request/context.");
        }

        if (context.Claims.Any(claim =>
                claim is null ||
                string.IsNullOrWhiteSpace(claim.ClaimId) ||
                !claim.ClaimId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                claim.EntityIds is null ||
                claim.EntityIds.Any(id => string.IsNullOrWhiteSpace(id) || !id.StartsWith("SYNTH-", StringComparison.Ordinal)) ||
                claim.RelationshipIds is null ||
                claim.RelationshipIds.Any(id => string.IsNullOrWhiteSpace(id) || !id.StartsWith("SYNTH-", StringComparison.Ordinal)) ||
                claim.EvidenceIds is null ||
                claim.EvidenceIds.Any(id => string.IsNullOrWhiteSpace(id) || !id.StartsWith("SYNTH-", StringComparison.Ordinal))) ||
            context.Sources.Any(source =>
                source is null ||
                string.IsNullOrWhiteSpace(source.EvidenceId) ||
                !source.EvidenceId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(source.RecordId) ||
                !source.RecordId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(source.ProvenanceId) ||
                !source.ProvenanceId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(source.AuthorizationDecisionId) ||
                !source.AuthorizationDecisionId.StartsWith("SYNTH-", StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(source.SourceSystem) ||
                !source.SourceSystem.StartsWith("Synthetic", StringComparison.Ordinal) ||
                (source.Location is not null && !source.Location.StartsWith("synthetic://", StringComparison.Ordinal)) ||
                (source.DeepLink is not null && !source.DeepLink.StartsWith("synthetic://", StringComparison.Ordinal))) ||
            request.ConversationHistory.Any(turn =>
                turn is null ||
                string.IsNullOrWhiteSpace(turn.TurnId) ||
                !turn.TurnId.StartsWith("SYNTH-", StringComparison.Ordinal)))
        {
            throw new InvalidDataException($"Prompt evaluation case '{evaluationCase.CaseId}' contains non-synthetic evidence or history.");
        }

        if (context.Omissions.Any(omission =>
                omission is null ||
                string.IsNullOrWhiteSpace(omission.ClaimId) ||
                !omission.ClaimId.StartsWith("SYNTH-", StringComparison.Ordinal)))
        {
            throw new InvalidDataException($"Prompt evaluation case '{evaluationCase.CaseId}' contains non-synthetic omissions.");
        }
    }

    private static void EnsureExpectedReferences(FewShotPromptEvaluationCase evaluationCase)
    {
        EnsureSyntheticUniqueIds(evaluationCase.ExpectedClaimIds, "claim");
        EnsureSyntheticUniqueIds(evaluationCase.ExpectedEvidenceIds, "evidence");
        EnsureSyntheticUniqueIds(evaluationCase.ExpectedSourceIds, "source");

        var claimIds = evaluationCase.Context.Claims.Select(claim => claim.ClaimId).ToHashSet(StringComparer.Ordinal);
        var evidenceIds = evaluationCase.Context.Claims.SelectMany(claim => claim.EvidenceIds)
            .Concat(evaluationCase.Context.Sources.Select(source => source.EvidenceId))
            .ToHashSet(StringComparer.Ordinal);
        var sourceIds = evaluationCase.Context.Sources.Select(source => source.ProvenanceId)
            .ToHashSet(StringComparer.Ordinal);
        if (evaluationCase.ExpectedClaimIds.Any(id => !claimIds.Contains(id)) ||
            evaluationCase.ExpectedEvidenceIds.Any(id => !evidenceIds.Contains(id)) ||
            evaluationCase.ExpectedSourceIds.Any(id => !sourceIds.Contains(id)))
        {
            throw new InvalidDataException($"Prompt evaluation case '{evaluationCase.CaseId}' has expected references absent from its current Context Package.");
        }
    }

    private static void EnsureSyntheticUniqueIds(IReadOnlyList<string> ids, string kind)
    {
        if (ids.Any(id => string.IsNullOrWhiteSpace(id) || !id.StartsWith("SYNTH-", StringComparison.Ordinal)) ||
            ids.Distinct(StringComparer.Ordinal).Count() != ids.Count)
        {
            throw new InvalidDataException($"Expected {kind} IDs must be unique synthetic identifiers.");
        }
    }

    private static void EnsureDispositionMatchesGeneration(FewShotPromptEvaluationCase evaluationCase)
    {
        if (evaluationCase.ModelCallExpected)
        {
            if (evaluationCase.ExpectedDisposition != AnswerDisposition.Answer ||
                evaluationCase.Intent is FewShotPromptIntent.Clarification or FewShotPromptIntent.InsufficientEvidence)
            {
                throw new InvalidDataException("Only answer-generation cases may expect a model call.");
            }

            if (evaluationCase.ExpectedClaimIds.Count == 0 ||
                evaluationCase.ExpectedEvidenceIds.Count == 0 ||
                evaluationCase.ExpectedSourceIds.Count == 0)
            {
                throw new InvalidDataException("Generation cases require synthetic expected claim, evidence, and source references.");
            }

            return;
        }

        var expectedControlDisposition = evaluationCase.Intent switch
        {
            FewShotPromptIntent.Clarification => AnswerDisposition.Clarify,
            FewShotPromptIntent.InsufficientEvidence => AnswerDisposition.Abstain,
            _ => (AnswerDisposition?)null
        };
        if (expectedControlDisposition is null ||
            evaluationCase.ExpectedDisposition != expectedControlDisposition ||
            evaluationCase.ExpectedClaimIds.Count > 0 ||
            evaluationCase.ExpectedEvidenceIds.Count > 0 ||
            evaluationCase.ExpectedSourceIds.Count > 0)
        {
            throw new InvalidDataException("A no-generation case must be a clarification or insufficient-evidence control case.");
        }

        var requiredTag = evaluationCase.Intent == FewShotPromptIntent.Clarification
            ? "clarification"
            : "abstention";
        if (!evaluationCase.ScenarioTags.Contains(requiredTag, StringComparer.Ordinal))
        {
            throw new InvalidDataException("A control case must carry the scenario tag matching its typed intent.");
        }
    }

    private static void ValidateCoverage(
        IReadOnlyList<FewShotPromptEvaluationCase> cases,
        IReadOnlyList<string> requiredScenarioTags)
    {
        var coveredTags = cases.SelectMany(evaluationCase => evaluationCase.ScenarioTags)
            .ToHashSet(StringComparer.Ordinal);
        var missingTags = requiredScenarioTags.Where(tag => !coveredTags.Contains(tag)).ToArray();
        if (missingTags.Length > 0)
        {
            throw new InvalidDataException(
                $"Prompt evaluation dataset is missing required scenario tags: {string.Join(", ", missingTags)}.");
        }
    }

    private static void EnsureNoDuplicateProperties(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name))
                {
                    throw new InvalidDataException($"A prompt evaluation JSON object repeats field '{property.Name}'.");
                }

                EnsureNoDuplicateProperties(property.Value);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in element.EnumerateArray())
            {
                EnsureNoDuplicateProperties(child);
            }
        }
    }

    private static void EnsureExactProperties(JsonElement element, params string[] expectedProperties)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("The prompt evaluation manifest must be a JSON object.");
        }

        var expected = new HashSet<string>(expectedProperties, StringComparer.Ordinal);
        var found = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!expected.Contains(property.Name))
            {
                throw new InvalidDataException($"The prompt evaluation manifest has an unknown field '{property.Name}'.");
            }

            found.Add(property.Name);
        }

        if (!found.SetEquals(expected))
        {
            throw new InvalidDataException("The prompt evaluation manifest is missing required fields.");
        }
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(property.GetString()))
        {
            throw new InvalidDataException($"Prompt evaluation manifest field '{propertyName}' is required.");
        }

        return property.GetString()!;
    }

    private static int RequiredInt32(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Number ||
            !property.TryGetInt32(out var value))
        {
            throw new InvalidDataException($"Prompt evaluation manifest field '{propertyName}' must be an integer.");
        }

        return value;
    }

    private static string[] ReadStringArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidDataException($"Prompt evaluation manifest field '{propertyName}' must be an array.");
        }

        var values = property.EnumerateArray()
            .Select(value =>
            {
                if (value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
                {
                    throw new InvalidDataException($"Prompt evaluation manifest field '{propertyName}' contains an invalid value.");
                }

                return value.GetString()!;
            })
            .ToArray();
        if (values.Distinct(StringComparer.Ordinal).Count() != values.Length)
        {
            throw new InvalidDataException($"Prompt evaluation manifest field '{propertyName}' contains duplicate values.");
        }

        return values;
    }

    private static string ResolveDatasetFile(string root, string relativePath, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || Path.IsPathRooted(relativePath))
        {
            throw new InvalidDataException($"Prompt evaluation dataset {fieldName} must be a relative file path.");
        }

        var fullPath = Path.GetFullPath(Path.Combine(root, relativePath));
        var relativeToRoot = Path.GetRelativePath(root, fullPath);
        if (relativeToRoot == ".." ||
            relativeToRoot.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal) ||
            relativeToRoot.StartsWith(".." + Path.AltDirectorySeparatorChar, StringComparison.Ordinal) ||
            !File.Exists(fullPath))
        {
            throw new InvalidDataException($"Prompt evaluation dataset {fieldName} does not resolve to a file inside the dataset directory.");
        }

        return fullPath;
    }

    private static JsonSerializerOptions CreateCaseJsonOptions()
    {
        var options = new JsonSerializerOptions
        {
            MaxDepth = 32,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = false,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
        };
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    private sealed record DatasetManifest(
        string Id,
        string Version,
        string Classification,
        int CaseCount,
        string CasesFile,
        string[] RequiredScenarioTags);
}
