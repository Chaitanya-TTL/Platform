namespace Orchestration.API.Engineering.Contracts;

public enum TeamcenterObservationState
{
    ObservedSuccess,
    ObservedFailure,
    NotObserved,
    NotRequested
}

public sealed record TeamcenterStageEvidence(
    EngineeringStage Stage,
    TeamcenterObservationState Observation,
    string Code,
    string Message,
    DateTimeOffset ObservedAt);

public sealed record TeamcenterArtifactManifest(
    string SchemaVersion,
    string JobId,
    string RequestedItemId,
    DateTimeOffset ExecutionStartedAt,
    DateTimeOffset CapturedAt,
    IReadOnlyList<SourceArtifactReference> Artifacts,
    IReadOnlyList<TeamcenterStageEvidence> Stages);
