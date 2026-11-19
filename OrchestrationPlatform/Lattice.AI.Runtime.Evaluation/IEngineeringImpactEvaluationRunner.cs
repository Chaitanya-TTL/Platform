namespace Lattice.AI.Runtime.Evaluation;

public interface IEngineeringImpactEvaluationRunner
{
    Task<EngineeringImpactEvaluationReport> RunAsync(
        string datasetPath,
        CancellationToken cancellationToken);
}
