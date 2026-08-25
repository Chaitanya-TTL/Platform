using System.Collections.Concurrent;
using Orchestration.API.Engineering.Contracts;
namespace Orchestration.API.Engineering.Federation;

public interface IFederatedCandidateSelectionStore
{
    FederatedCandidateSelectionResult Record(FederatedCandidateSelectionRequest request, FederatedDiscoveryJobSnapshot job);
    bool TryGet(string parentJobId, out FederatedCandidateSelectionResult? result);
}
public sealed class FederatedCandidateSelectionStore : IFederatedCandidateSelectionStore
{
    private readonly ConcurrentDictionary<string,FederatedCandidateSelectionResult> values = new();
    public FederatedCandidateSelectionResult Record(FederatedCandidateSelectionRequest request, FederatedDiscoveryJobSnapshot job)
    {
        var candidates = job.Result?.Sources.SelectMany(x => x.Candidates).ToDictionary(x => x.CandidateId) ?? new();
        var errors = new List<StructuredError>();
        foreach (var selection in request.Selections)
            if (selection.Decision == CandidateSelectionDecision.Selected && (selection.CandidateId is null || !candidates.TryGetValue(selection.CandidateId, out var candidate) || candidate.Source != selection.Source))
                errors.Add(new("candidate-selection-invalid", selection.Source, EngineeringStage.Resolution,
                    "The selected candidate does not belong to this discovery job and source.", "Select a candidate returned by the current source result.", false, DateTimeOffset.UtcNow));
        var selected = request.Selections.Count(x => x.Decision == CandidateSelectionDecision.Selected);
        var state = errors.Count > 0 ? SelectionState.AwaitingSelection : selected == 0 ? SelectionState.Rejected : selected == request.Selections.Count ? SelectionState.Selected : SelectionState.PartialSelection;
        var result = new FederatedCandidateSelectionResult(request.SchemaVersion, request.ParentJobId, state, request.Selections, errors, DateTimeOffset.UtcNow);
        if (errors.Count == 0) values[request.ParentJobId] = result;
        return result;
    }
    public bool TryGet(string id, out FederatedCandidateSelectionResult? result) => values.TryGetValue(id, out result);
}
