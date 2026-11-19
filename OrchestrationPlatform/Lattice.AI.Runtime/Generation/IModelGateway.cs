using Lattice.AI.Runtime.Contracts.Generation;

namespace Lattice.AI.Runtime.Generation;

public interface IModelGateway
{
    Task<ModelResponse> GenerateAsync(ModelRequest request, CancellationToken cancellationToken);
}
