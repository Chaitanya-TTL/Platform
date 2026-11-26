namespace Lattice.AI.Runtime.Evaluation.SourceEvidence;

public sealed record SourceEvidenceVector(
    string Model,
    string Version,
    IReadOnlyList<float> Values);

public interface ISourceEvidenceEmbeddingProvider
{
    Task<IReadOnlyList<SourceEvidenceVector>> EmbedAsync(
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken);
}
