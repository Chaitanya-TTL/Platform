using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Federation;

public interface IFederatedCandidateEvaluator
{
    SourceCandidate Evaluate(SourceCandidate candidate, NormalizedEngineeringQuery query, out StructuredWarning? warning);
    IReadOnlyList<CandidateCorrespondence> Correspond(IReadOnlyList<SourceCandidate> candidates);
}

public sealed class FederatedCandidateEvaluator : IFederatedCandidateEvaluator
{
    public SourceCandidate Evaluate(SourceCandidate candidate, NormalizedEngineeringQuery query, out StructuredWarning? warning)
    {
        warning = null;
        var id = query.ProductId.NormalizedValue;
        var name = query.ProductName.NormalizedValue;
        var nativeId = candidate.NativeId.Trim();
        var display = NormalizeName(candidate.DisplayName);
        var idMatch = id is not null && string.Equals(nativeId, id, StringComparison.OrdinalIgnoreCase);
        var nameMatch = name is not null && string.Equals(display, NormalizeName(name), StringComparison.Ordinal);
        if (idMatch && name is not null && !nameMatch)
            warning = new("candidate-name-mismatch", candidate.Source, EngineeringStage.Discovery,
                "The source identifier matched, but the returned display name did not match the supplied Product Name.", DateTimeOffset.UtcNow,
                new Dictionary<string,string> { ["candidateId"] = candidate.CandidateId });
        if (idMatch) return candidate.Provenance.Kind == ProvenanceKind.LiveSource ? candidate with { MatchCategory = MatchCategory.VerifiedIdentifierMatch, ConfidenceClass = ConfidenceClass.Verified, MatchReason = "The live source verified the supplied Product ID." } : candidate with { MatchReason = "The source-native identifier matches the supplied Product ID, but source existence has not been verified." };
        if (nameMatch) return candidate with { MatchCategory = MatchCategory.ExactSourceNameMatch, ConfidenceClass = ConfidenceClass.Deterministic, MatchReason = "The source display name exactly matches the normalized Product Name." };
        return candidate;
    }

    public IReadOnlyList<CandidateCorrespondence> Correspond(IReadOnlyList<SourceCandidate> candidates)
    {
        var results = new List<CandidateCorrespondence>();
        foreach (var group in candidates.GroupBy(x => x.NativeId.Trim(), StringComparer.OrdinalIgnoreCase).Where(x => x.Select(c => c.Source).Distinct().Count() > 1))
        {
            var ids = group.Select(x => x.CandidateId).ToArray();
            results.Add(new($"corr-{Guid.NewGuid():N}", ids, MatchCategory.DeterministicNormalizedIdMatch,
                "Source-native identifiers are deterministically equal after case-insensitive comparison.",
                [new("normalized-identifier", group.Key)], ConfidenceClass.Deterministic,
                CorrespondenceReviewState.Unreviewed, [], DateTimeOffset.UtcNow));
        }
        foreach (var group in candidates.GroupBy(x => NormalizeName(x.DisplayName)).Where(x => x.Key.Length > 0 && x.Select(c => c.Source).Distinct().Count() > 1))
        {
            var ids = group.Select(x => x.CandidateId).ToArray();
            if (results.Any(x => x.SourceCandidateIds.Order().SequenceEqual(ids.Order()))) continue;
            results.Add(new($"corr-{Guid.NewGuid():N}", ids, MatchCategory.ExactNormalizedNameMatch,
                "Candidate names match after conservative whitespace and case normalization. This does not merge the records.",
                [new("normalized-name", group.Key)], ConfidenceClass.Probable,
                CorrespondenceReviewState.Ambiguous, ["name-only-evidence"], DateTimeOffset.UtcNow));
        }
        return results;
    }

    private static string NormalizeName(string value) => string.Join(' ', value.Trim().ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
